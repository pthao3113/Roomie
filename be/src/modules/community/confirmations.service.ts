import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import {
  Confirmation,
  ConfirmationDocument,
  ConfirmationTargetType,
} from './schemas/confirmation.schema.js';
import { Property, PropertyDocument } from '../properties/schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitDocument,
} from '../properties/schemas/rental-unit.schema.js';
import { QueryMyConfirmationsDto } from './dto/query-my-confirmations.dto.js';
import { COMMUNITY_CONFIG } from './community.config.js';

export interface ConfirmationResponse {
  id: string;
  targetType: ConfirmationTargetType;
  targetId: string;
  propertyId: string;
  createdAt: Date;
}

export interface ConfirmationSummaryResponse {
  targetType: ConfirmationTargetType;
  targetId: string;
  confirmationCount: number;
}

export interface WithdrawnConfirmationResponse {
  targetType: ConfirmationTargetType;
  targetId: string;
  withdrawnAt: Date;
}

export interface MyConfirmationsResponse {
  data: ConfirmationResponse[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Community Confirmation (Migration 4 - LU1).
 * A confirmation is a community SIGNAL. It is not proof of tenancy, never affects
 * averageRating/reviewCount and never yields a "Verified" label.
 */
@Injectable()
export class ConfirmationsService {
  constructor(
    @InjectModel(Confirmation.name)
    private readonly confirmationModel: Model<ConfirmationDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(RentalUnit.name)
    private readonly rentalUnitModel: Model<RentalUnitDocument>,
  ) {}

  // ---------- Create ----------

  async confirmProperty(propertyId: string, userId: string): Promise<ConfirmationResponse> {
    const property = await this.findActiveProperty(propertyId);
    return this.createConfirmation(
      'property',
      property._id as Types.ObjectId,
      property._id as Types.ObjectId,
      property.createdBy,
      userId,
    );
  }

  async confirmRentalUnit(unitId: string, userId: string): Promise<ConfirmationResponse> {
    const unit = await this.findActiveRentalUnit(unitId);
    return this.createConfirmation(
      'rental_unit',
      unit._id as Types.ObjectId,
      unit.propertyId,
      unit.createdBy,
      userId,
    );
  }

  private async createConfirmation(
    targetType: ConfirmationTargetType,
    targetId: Types.ObjectId,
    propertyId: Types.ObjectId,
    creatorId: Types.ObjectId,
    userId: string,
  ): Promise<ConfirmationResponse> {
    const userObjectId = new Types.ObjectId(userId);

    // Creators cannot confirm their own content
    if (creatorId.equals(userObjectId)) {
      throw new ForbiddenException('Bạn không thể xác nhận nội dung do chính mình tạo');
    }

    await this.assertWithinRateLimit(userObjectId);

    try {
      const created = await this.confirmationModel.create({
        userId: userObjectId,
        targetType,
        targetId,
        propertyId,
        deletedAt: null,
      });
      return this.toResponse(created);
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Bạn đã xác nhận nội dung này rồi');
      }
      throw error;
    }
  }

  /**
   * Counts ALL confirmations created by the user inside the window, INCLUDING withdrawn
   * (soft-deleted) ones, so withdrawing and re-confirming repeatedly cannot bypass the limit.
   * Note: check-then-insert is not atomic; slight overshoot is possible under concurrency.
   */
  private async assertWithinRateLimit(userObjectId: Types.ObjectId): Promise<void> {
    const since = new Date(Date.now() - COMMUNITY_CONFIG.rateLimit.windowMs);
    const recentCount = await this.confirmationModel
      .countDocuments({ userId: userObjectId, createdAt: { $gte: since } })
      .exec();

    if (recentCount >= COMMUNITY_CONFIG.rateLimit.confirmationsPerWindow) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Bạn đã đạt giới hạn ${COMMUNITY_CONFIG.rateLimit.confirmationsPerWindow} lượt xác nhận trong 24 giờ. Vui lòng thử lại sau.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ---------- Withdraw ----------

  async withdrawPropertyConfirmation(
    propertyId: string,
    userId: string,
  ): Promise<WithdrawnConfirmationResponse> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }
    return this.withdraw('property', propertyId, userId);
  }

  async withdrawRentalUnitConfirmation(
    unitId: string,
    userId: string,
  ): Promise<WithdrawnConfirmationResponse> {
    if (!isValidObjectId(unitId)) {
      throw new BadRequestException('ID phòng không hợp lệ');
    }
    return this.withdraw('rental_unit', unitId, userId);
  }

  /**
   * Soft-deletes the caller's own active confirmation (only their own is matched).
   * Allowed even if the target was deleted meanwhile.
   */
  private async withdraw(
    targetType: ConfirmationTargetType,
    targetId: string,
    userId: string,
  ): Promise<WithdrawnConfirmationResponse> {
    const withdrawnAt = new Date();
    const withdrawn = await this.confirmationModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          targetType,
          targetId: new Types.ObjectId(targetId),
          deletedAt: null,
        },
        { $set: { deletedAt: withdrawnAt } },
        { new: true },
      )
      .exec();

    if (!withdrawn) {
      throw new NotFoundException('Bạn chưa có xác nhận đang hiệu lực cho nội dung này');
    }

    return { targetType, targetId, withdrawnAt };
  }

  // ---------- Public summary ----------

  async getPropertySummary(propertyId: string): Promise<ConfirmationSummaryResponse> {
    const property = await this.findActiveProperty(propertyId);
    return this.buildSummary('property', property._id as Types.ObjectId);
  }

  async getRentalUnitSummary(unitId: string): Promise<ConfirmationSummaryResponse> {
    const unit = await this.findActiveRentalUnit(unitId);
    return this.buildSummary('rental_unit', unit._id as Types.ObjectId);
  }

  /**
   * Counts active confirmations from accounts that are neither deactivated nor soft-deleted.
   * Returns only the count (no user identity). Uses $lookup with a sub-pipeline (MongoDB >= 5.0).
   */
  private async buildSummary(
    targetType: ConfirmationTargetType,
    targetId: Types.ObjectId,
  ): Promise<ConfirmationSummaryResponse> {
    const result = await this.confirmationModel
      .aggregate([
        { $match: { targetType, targetId, deletedAt: null } },
        {
          $lookup: {
            from: 'users', // collection name of the User schema
            localField: 'userId',
            foreignField: '_id',
            pipeline: [
              { $match: { deletedAt: null, deactivatedAt: null } },
              { $project: { _id: 1 } },
            ],
            as: 'activeUser',
          },
        },
        { $match: { 'activeUser.0': { $exists: true } } },
        { $count: 'count' },
      ])
      .exec();

    return {
      targetType,
      targetId: targetId.toString(),
      confirmationCount: result.length > 0 ? result[0].count : 0,
    };
  }

  // ---------- My confirmations ----------

  /**
   * Lists the caller's active confirmations whose target is still active
   * (Property not deleted; for RentalUnit also the unit not deleted). The active-target
   * filter runs BEFORE skip/limit so pagination totals are accurate.
   * Bounded by the caller's own confirmations. Uses $lookup sub-pipelines (MongoDB >= 5.0).
   */
  async getMyConfirmations(
    userId: string,
    query: QueryMyConfirmationsDto,
  ): Promise<MyConfirmationsResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(
      COMMUNITY_CONFIG.pagination.maxLimit,
      Math.max(1, query.limit || COMMUNITY_CONFIG.pagination.defaultLimit),
    );
    const skip = (page - 1) * limit;

    const [result] = await this.confirmationModel
      .aggregate([
        { $match: { userId: new Types.ObjectId(userId), deletedAt: null } },
        {
          $lookup: {
            from: 'properties', // collection name of the Property schema
            localField: 'propertyId',
            foreignField: '_id',
            pipeline: [{ $match: { deletedAt: null } }, { $project: { _id: 1 } }],
            as: 'activeProperty',
          },
        },
        {
          $lookup: {
            from: 'rental_units', // collection name of the RentalUnit schema
            localField: 'targetId',
            foreignField: '_id',
            pipeline: [{ $match: { deletedAt: null } }, { $project: { _id: 1 } }],
            as: 'activeUnit',
          },
        },
        {
          $match: {
            'activeProperty.0': { $exists: true },
            $or: [
              { targetType: 'property' },
              { 'activeUnit.0': { $exists: true } },
            ],
          },
        },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $facet: {
            data: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  targetType: 1,
                  targetId: 1,
                  propertyId: 1,
                  createdAt: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const total: number = result?.total?.[0]?.count ?? 0;
    const items: any[] = result?.data ?? [];

    return {
      data: items.map((c) => this.toResponse(c)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  // ---------- Helpers ----------

  private async findActiveProperty(propertyId: string): Promise<PropertyDocument> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }
    const property = await this.propertyModel
      .findOne({ _id: propertyId, deletedAt: null })
      .exec();
    if (!property) {
      throw new NotFoundException('Nhà trọ không tồn tại hoặc đã bị xóa');
    }
    return property;
  }

  private async findActiveRentalUnit(unitId: string): Promise<RentalUnitDocument> {
    if (!isValidObjectId(unitId)) {
      throw new BadRequestException('ID phòng không hợp lệ');
    }
    const unit = await this.rentalUnitModel
      .findOne({ _id: unitId, deletedAt: null })
      .exec();
    if (!unit) {
      throw new NotFoundException('Phòng không tồn tại hoặc đã bị xóa');
    }
    const property = await this.propertyModel
      .findOne({ _id: unit.propertyId, deletedAt: null })
      .exec();
    if (!property) {
      throw new NotFoundException('Nhà trọ chứa phòng này không tồn tại hoặc đã bị xóa');
    }
    return unit;
  }

  /** Explicit mapping: never exposes userId or raw documents. */
  private toResponse(c: {
    _id: Types.ObjectId;
    targetType: ConfirmationTargetType;
    targetId: Types.ObjectId;
    propertyId: Types.ObjectId;
    createdAt?: Date;
  }): ConfirmationResponse {
    return {
      id: c._id.toString(),
      targetType: c.targetType,
      targetId: c.targetId.toString(),
      propertyId: c.propertyId.toString(),
      createdAt: (c as any).createdAt,
    };
  }
}
