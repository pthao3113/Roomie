import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitDocument,
  normalizeUnitName,
} from './schemas/rental-unit.schema.js';
import { CreateRentalUnitDto } from './dto/create-rental-unit.dto.js';
import { UpdateRentalUnitDto } from './dto/update-rental-unit.dto.js';

@Injectable()
export class RentalUnitsService {
  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(RentalUnit.name)
    private readonly rentalUnitModel: Model<RentalUnitDocument>,
  ) {}

  /**
   * Create a new RentalUnit in an active Property
   */
  async createRentalUnit(
    propertyId: string,
    creatorId: string,
    dto: CreateRentalUnitDto,
  ): Promise<RentalUnitDocument> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }

    const property = await this.propertyModel
      .findOne({ _id: propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Nhà trọ không tồn tại hoặc đã bị xóa');
    }

    const normalizedUnitName = normalizeUnitName(dto.unitName);
    if (!normalizedUnitName) {
      throw new BadRequestException('Tên phòng không hợp lệ hoặc chỉ chứa khoảng trắng');
    }

    const rentalUnit = new this.rentalUnitModel({
      propertyId: new Types.ObjectId(propertyId),
      unitName: dto.unitName.trim(),
      normalizedUnitName,
      price: dto.price !== undefined ? dto.price : null,
      area: dto.area !== undefined ? dto.area : null,
      description: dto.description || '',
      amenities: dto.amenities || [],
      createdBy: new Types.ObjectId(creatorId),
      deletedAt: null,
    });

    try {
      return await rentalUnit.save();
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException('Tên phòng trọ đã tồn tại trong nhà trọ này');
      }
      throw error;
    }
  }

  /**
   * Get all active RentalUnits for an active Property
   */
  async getRentalUnitsByProperty(
    propertyId: string,
  ): Promise<RentalUnitDocument[]> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }

    const property = await this.propertyModel
      .findOne({ _id: propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Nhà trọ không tồn tại hoặc đã bị xóa');
    }

    return await this.rentalUnitModel
      .find({
        propertyId: new Types.ObjectId(propertyId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Update an existing active RentalUnit (Allowed only for unit creator & inside active Property)
   */
  async updateRentalUnit(
    unitId: string,
    currentUserId: string,
    dto: UpdateRentalUnitDto,
  ): Promise<RentalUnitDocument> {
    if (!isValidObjectId(unitId)) {
      throw new BadRequestException('ID phòng không hợp lệ');
    }

    const rentalUnit = await this.rentalUnitModel
      .findOne({ _id: unitId, deletedAt: null })
      .exec();

    if (!rentalUnit) {
      throw new NotFoundException('Phòng không tồn tại hoặc đã bị xóa');
    }

    // Verify parent Property is active
    const property = await this.propertyModel
      .findOne({ _id: rentalUnit.propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Nhà trọ chứa phòng này không tồn tại hoặc đã bị xóa');
    }

    // Authorization check: Only original creator of unit can update
    if (!rentalUnit.createdBy.equals(currentUserId)) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa phòng này');
    }

    if (dto.unitName !== undefined) {
      const normalized = normalizeUnitName(dto.unitName);
      if (!normalized) {
        throw new BadRequestException('Tên phòng không hợp lệ hoặc chỉ chứa khoảng trắng');
      }
      rentalUnit.unitName = dto.unitName.trim();
      rentalUnit.normalizedUnitName = normalized;
    }

    if (dto.price !== undefined) {
      rentalUnit.price = dto.price;
    }

    if (dto.area !== undefined) {
      rentalUnit.area = dto.area;
    }

    if (dto.description !== undefined) {
      rentalUnit.description = dto.description;
    }

    if (dto.amenities !== undefined) {
      rentalUnit.amenities = dto.amenities;
    }

    try {
      return await rentalUnit.save();
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException('Tên phòng trọ đã tồn tại trong nhà trọ này');
      }
      throw error;
    }
  }

  /**
   * Soft-delete an active RentalUnit (Allowed only for unit creator & inside active Property)
   */
  async deleteRentalUnit(
    unitId: string,
    currentUserId: string,
  ): Promise<RentalUnitDocument> {
    if (!isValidObjectId(unitId)) {
      throw new BadRequestException('ID phòng không hợp lệ');
    }

    const rentalUnit = await this.rentalUnitModel
      .findOne({ _id: unitId, deletedAt: null })
      .exec();

    if (!rentalUnit) {
      throw new NotFoundException('Phòng không tồn tại hoặc đã bị xóa');
    }

    // Verify parent Property is active
    const property = await this.propertyModel
      .findOne({ _id: rentalUnit.propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Nhà trọ chứa phòng này không tồn tại hoặc đã bị xóa');
    }

    // Authorization check: Only original creator of unit can delete
    if (!rentalUnit.createdBy.equals(currentUserId)) {
      throw new ForbiddenException('Bạn không có quyền xóa phòng này');
    }

    rentalUnit.deletedAt = new Date();
    return await rentalUnit.save();
  }
}
