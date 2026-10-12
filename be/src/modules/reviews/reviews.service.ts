import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { Review, ReviewDocument, ReviewMedia } from './schemas/review.schema.js';
import {
  MediaUpload,
  MediaUploadDocument,
} from './schemas/media-upload.schema.js';
import { Property, PropertyDocument } from '../properties/schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitDocument,
} from '../properties/schemas/rental-unit.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { QueryReviewDto } from './dto/query-review.dto.js';
import {
  PublicReviewListResponseDto,
  PublicReviewItemDto,
} from './dto/public-review-response.dto.js';
import { MediaStorageService } from './media-storage.service.js';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(MediaUpload.name)
    private readonly mediaUploadModel: Model<MediaUploadDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(RentalUnit.name)
    private readonly rentalUnitModel: Model<RentalUnitDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mediaStorageService: MediaStorageService,
  ) {}

  /**
   * Recalculate and update averageRating and reviewCount for a Property
   * Aggregates ALL active reviews of the property (including reviews of its rental units)
   */
  async recalculatePropertyRating(propertyId: Types.ObjectId): Promise<void> {
    const stats = await this.reviewModel.aggregate([
      {
        $match: {
          propertyId: new Types.ObjectId(propertyId),
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$propertyId',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const averageRating =
      stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
    const reviewCount = stats.length > 0 ? stats[0].count : 0;

    await this.propertyModel.updateOne(
      { _id: propertyId },
      { $set: { averageRating, reviewCount } },
    );
  }

  /**
   * Recalculate and update averageRating and reviewCount for a RentalUnit
   * Aggregates active reviews belonging directly to that rental unit
   */
  async recalculateRentalUnitRating(
    rentalUnitId: Types.ObjectId,
  ): Promise<void> {
    const stats = await this.reviewModel.aggregate([
      {
        $match: {
          rentalUnitId: new Types.ObjectId(rentalUnitId),
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$rentalUnitId',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const averageRating =
      stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
    const reviewCount = stats.length > 0 ? stats[0].count : 0;

    await this.rentalUnitModel.updateOne(
      { _id: rentalUnitId },
      { $set: { averageRating, reviewCount } },
    );
  }

  /**
   * Recalculate averageRating and reviewCount for all active properties and rental units in batches.
   * Can be executed manually via standalone CLI/script upon migration or for bulk repair.
   * Idempotent: safe to run multiple times.
   *
   * Note on Concurrency:
   * Aggregating and $set does not guarantee absolute instantaneous atomicity if concurrent review
   * creations or updates occur during execution. In case of drift, daily reconciliation will align the values.
   */
  async backfillAllRatings(batchSize = 50): Promise<{
    propertiesUpdated: number;
    unitsUpdated: number;
  }> {
    return this.reconcileAllRatingsInBatches(batchSize);
  }

  /**
   * Daily periodic reconciliation cron job (running at midnight 00:00).
   * Automatically resolves rating drift across properties and rental units in batches.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyRatingReconciliation(): Promise<void> {
    this.logger.log('Bắt đầu cron job đối soát định kỳ rating (daily reconciliation)...');
    try {
      const { propertiesUpdated, unitsUpdated } =
        await this.reconcileAllRatingsInBatches(50);
      this.logger.log(
        `Hoàn tất đối soát định kỳ rating: ${propertiesUpdated} nhà trọ, ${unitsUpdated} phòng trọ.`,
      );
    } catch (err: any) {
      this.logger.error(
        `Lỗi cron đối soát định kỳ rating: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Batch reconciliation for properties and rental units.
   * Processes records chunk by chunk (default 50) using cursor pagination by _id
   * to avoid high memory consumption and long MongoDB cursor locks.
   */
  async reconcileAllRatingsInBatches(batchSize = 50): Promise<{
    propertiesUpdated: number;
    unitsUpdated: number;
  }> {
    let propertiesUpdated = 0;
    let unitsUpdated = 0;

    // 1. Process Properties in batches
    let lastPropertyId: Types.ObjectId | null = null;
    while (true) {
      const filter: any = { deletedAt: null };
      if (lastPropertyId) {
        filter._id = { $gt: lastPropertyId };
      }

      const propBatch = await this.propertyModel
        .find(filter)
        .sort({ _id: 1 })
        .limit(batchSize)
        .select('_id')
        .exec();

      if (propBatch.length === 0) {
        break;
      }

      for (const prop of propBatch) {
        await this.recalculatePropertyRating(prop._id as Types.ObjectId);
      }

      propertiesUpdated += propBatch.length;
      lastPropertyId = propBatch[propBatch.length - 1]._id as Types.ObjectId;
    }

    // 2. Process RentalUnits in batches
    let lastUnitId: Types.ObjectId | null = null;
    while (true) {
      const filter: any = { deletedAt: null };
      if (lastUnitId) {
        filter._id = { $gt: lastUnitId };
      }

      const unitBatch = await this.rentalUnitModel
        .find(filter)
        .sort({ _id: 1 })
        .limit(batchSize)
        .select('_id')
        .exec();

      if (unitBatch.length === 0) {
        break;
      }

      for (const unit of unitBatch) {
        await this.recalculateRentalUnitRating(unit._id as Types.ObjectId);
      }

      unitsUpdated += unitBatch.length;
      lastUnitId = unitBatch[unitBatch.length - 1]._id as Types.ObjectId;
    }

    return { propertiesUpdated, unitsUpdated };
  }

  /**
   * On-demand reconciliation for a single Property to fix potential rating drift
   */
  async reconcilePropertyRating(propertyId: string): Promise<void> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }
    await this.recalculatePropertyRating(new Types.ObjectId(propertyId));
  }

  /**
   * Validate media items from database, checking ownership, unattached status, and limits (<= 5 images, <= 1 video)
   */
  private async validateAndPrepareMedia(
    publicIds: string[],
    userId: string,
    allowedReviewId: Types.ObjectId | null = null,
  ): Promise<MediaUploadDocument[]> {
    if (publicIds.length === 0) return [];

    // Query media items directly from DB (source of truth)
    const mediaRecords = await this.mediaUploadModel
      .find({ publicId: { $in: publicIds } })
      .exec();

    if (mediaRecords.length !== publicIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều tệp media không tồn tại trong hệ thống',
      );
    }

    const userObjectId = new Types.ObjectId(userId);

    for (const record of mediaRecords) {
      // 1. Ownership check: Must belong to current user
      if (!record.userId.equals(userObjectId)) {
        throw new ForbiddenException(
          'Bạn không có quyền sử dụng tệp đa phương tiện của người khác',
        );
      }

      // 2. Unattached / Anti-reuse check: Must not be detached and must not be attached to another review
      const isClaimedByOther =
        record.reviewId != null &&
        (!allowedReviewId || !record.reviewId.equals(allowedReviewId));

      if (isClaimedByOther || record.detachedAt !== null) {
        throw new BadRequestException(
          `Tệp đa phương tiện ${record.publicId} đã được gắn vào đánh giá khác hoặc đã bị gỡ bỏ`,
        );
      }
    }

    // 3. Limits enforcement: Max 5 images, Max 1 video
    const imageCount = mediaRecords.filter((m) => m.type === 'image').length;
    const videoCount = mediaRecords.filter((m) => m.type === 'video').length;

    if (imageCount > 5) {
      throw new BadRequestException('Mỗi đánh giá chỉ được đính kèm tối đa 5 ảnh');
    }

    if (videoCount > 1) {
      throw new BadRequestException('Mỗi đánh giá chỉ được đính kèm tối đa 1 video');
    }

    return mediaRecords;
  }

  /**
   * Create a new Review for a Property or a specific RentalUnit
   */
  async createReview(
    propertyId: string,
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDocument> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }

    const property = await this.propertyModel
      .findOne({ _id: propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Nhà trọ không tồn tại hoặc đã bị xóa');
    }

    let rentalUnitObjectId: Types.ObjectId | null = null;

    if (dto.rentalUnitId) {
      if (!isValidObjectId(dto.rentalUnitId)) {
        throw new BadRequestException('ID phòng trọ không hợp lệ');
      }

      const rentalUnit = await this.rentalUnitModel
        .findOne({ _id: dto.rentalUnitId, deletedAt: null })
        .exec();

      if (!rentalUnit) {
        throw new NotFoundException('Phòng trọ không tồn tại hoặc đã bị xóa');
      }

      if (!rentalUnit.propertyId.equals(new Types.ObjectId(propertyId))) {
        throw new BadRequestException('Phòng trọ không thuộc về nhà trọ này');
      }

      rentalUnitObjectId = new Types.ObjectId(dto.rentalUnitId);
    }

    const reviewId = new Types.ObjectId();
    const publicIds = dto.media ? dto.media.map((m) => m.publicId) : [];
    let verifiedMediaRecords: MediaUploadDocument[] = [];

    if (publicIds.length > 0) {
      verifiedMediaRecords = await this.validateAndPrepareMedia(
        publicIds,
        userId,
        null,
      );

      // Atomic claim media
      const claimResult = await this.mediaUploadModel.updateMany(
        {
          publicId: { $in: publicIds },
          userId: new Types.ObjectId(userId),
          reviewId: null,
          detachedAt: null,
        },
        {
          $set: { reviewId, isAttached: true },
        },
      );

      if (claimResult.modifiedCount !== publicIds.length) {
        // Rollback partial claims
        await this.mediaUploadModel.updateMany(
          { publicId: { $in: publicIds }, reviewId },
          { $set: { reviewId: null, isAttached: false } },
        );
        throw new BadRequestException('Tệp đa phương tiện đã bị gắn bởi thao tác khác');
      }
    }

    const reviewMediaList: ReviewMedia[] = verifiedMediaRecords.map((m) => ({
      type: m.type,
      url: m.url,
      publicId: m.publicId,
    }));

    const review = new this.reviewModel({
      _id: reviewId,
      propertyId: new Types.ObjectId(propertyId),
      rentalUnitId: rentalUnitObjectId,
      userId: new Types.ObjectId(userId),
      rating: dto.rating,
      comment: dto.comment ? dto.comment.trim() : '',
      isAnonymous: dto.isAnonymous ?? false,
      media: reviewMediaList,
      deletedAt: null,
    });

    try {
      const savedReview = await review.save();

      // Recalculate ratings
      await this.recalculatePropertyRating(savedReview.propertyId);
      if (savedReview.rentalUnitId) {
        await this.recalculateRentalUnitRating(savedReview.rentalUnitId);
      }

      return savedReview;
    } catch (error: any) {
      // Rollback media attachment if saving review fails
      if (publicIds.length > 0) {
        await this.mediaUploadModel.updateMany(
          { publicId: { $in: publicIds }, reviewId },
          { $set: { reviewId: null, isAttached: false } },
        );
      }

      if (error.code === 11000) {
        throw new ConflictException(
          'Bạn đã có đánh giá cho địa điểm hoặc phòng trọ này rồi',
        );
      }
      throw error;
    }
  }

  /**
   * Update an existing active Review (Only review author)
   */
  async updateReview(
    reviewId: string,
    currentUserId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewDocument> {
    if (!isValidObjectId(reviewId)) {
      throw new BadRequestException('ID đánh giá không hợp lệ');
    }

    const review = await this.reviewModel
      .findOne({ _id: reviewId, deletedAt: null })
      .exec();

    if (!review) {
      throw new NotFoundException('Đánh giá không tồn tại hoặc đã bị xóa');
    }

    if (!review.userId.equals(new Types.ObjectId(currentUserId))) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa đánh giá này');
    }

    const isRatingChanged =
      dto.rating !== undefined && dto.rating !== review.rating;

    if (dto.rating !== undefined) {
      review.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      review.comment = dto.comment.trim();
    }

    if (dto.isAnonymous !== undefined) {
      review.isAnonymous = dto.isAnonymous;
    }

    // Handle PATCH media semantics
    if (dto.media !== undefined) {
      const existingPublicIds = (review.media || []).map((m) => m.publicId);
      const newPublicIds = dto.media.map((m) => m.publicId);

      if (newPublicIds.length === 0) {
        // Gỡ toàn bộ media
        if (existingPublicIds.length > 0) {
          await this.mediaUploadModel.updateMany(
            { reviewId: review._id },
            {
              $set: {
                reviewId: null,
                isAttached: false,
                detachedAt: new Date(),
              },
            },
          );
        }
        review.media = [];
      } else {
        // Thay thế danh sách media
        const toAdd = newPublicIds.filter((id) => !existingPublicIds.includes(id));
        const toRemove = existingPublicIds.filter((id) => !newPublicIds.includes(id));

        // Validate all new public IDs
        const newRecords = await this.validateAndPrepareMedia(
          newPublicIds,
          currentUserId,
          review._id,
        );

        // Detach removed items
        if (toRemove.length > 0) {
          await this.mediaUploadModel.updateMany(
            { publicId: { $in: toRemove }, reviewId: review._id },
            {
              $set: {
                reviewId: null,
                isAttached: false,
                detachedAt: new Date(),
              },
            },
          );
        }

        // Claim newly added items
        if (toAdd.length > 0) {
          const claimResult = await this.mediaUploadModel.updateMany(
            {
              publicId: { $in: toAdd },
              userId: new Types.ObjectId(currentUserId),
              reviewId: null,
              detachedAt: null,
            },
            {
              $set: { reviewId: review._id, isAttached: true },
            },
          );

          if (claimResult.modifiedCount !== toAdd.length) {
            // Rollback only claims made by this operation
            await this.mediaUploadModel.updateMany(
              { publicId: { $in: toAdd }, reviewId: review._id },
              { $set: { reviewId: null, isAttached: false } },
            );
            throw new BadRequestException(
              'Một hoặc nhiều tệp media đã bị chiếm dụng bởi thao tác khác',
            );
          }
        }

        review.media = newRecords.map((m) => ({
          type: m.type,
          url: m.url,
          publicId: m.publicId,
        }));
      }
    }

    const updatedReview = await review.save();

    if (isRatingChanged) {
      await this.recalculatePropertyRating(updatedReview.propertyId);
      if (updatedReview.rentalUnitId) {
        await this.recalculateRentalUnitRating(updatedReview.rentalUnitId);
      }
    }

    return updatedReview;
  }

  /**
   * Soft-delete an active Review (Only review author; media remains attached to preserve audit record)
   */
  async deleteReview(
    reviewId: string,
    currentUserId: string,
  ): Promise<ReviewDocument> {
    if (!isValidObjectId(reviewId)) {
      throw new BadRequestException('ID đánh giá không hợp lệ');
    }

    const review = await this.reviewModel
      .findOne({ _id: reviewId, deletedAt: null })
      .exec();

    if (!review) {
      throw new NotFoundException('Đánh giá không tồn tại hoặc đã bị xóa');
    }

    if (!review.userId.equals(new Types.ObjectId(currentUserId))) {
      throw new ForbiddenException('Bạn không có quyền xóa đánh giá này');
    }

    review.deletedAt = new Date();
    const deleted = await review.save();

    // Recalculate ratings after soft delete
    await this.recalculatePropertyRating(deleted.propertyId);
    if (deleted.rentalUnitId) {
      await this.recalculateRentalUnitRating(deleted.rentalUnitId);
    }

    return deleted;
  }

  /**
   * Get public reviews for a Property with pagination, filters, and secure author/media presentation
   */
  async getReviewsByProperty(
    propertyId: string,
    query: QueryReviewDto,
  ): Promise<PublicReviewListResponseDto> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }

    const property = await this.propertyModel
      .findOne({ _id: propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Nhà trọ không tồn tại hoặc đã bị xóa');
    }

    // Property summary is always overall rating of Property, unaffected by list filters
    const summary = {
      averageRating: property.averageRating || 0,
      reviewCount: property.reviewCount || 0,
    };

    if (query.rentalUnitId) {
      if (!isValidObjectId(query.rentalUnitId)) {
        throw new BadRequestException('ID phòng trọ không hợp lệ');
      }

      const unit = await this.rentalUnitModel
        .findOne({ _id: query.rentalUnitId, deletedAt: null })
        .exec();

      if (!unit) {
        throw new NotFoundException('Phòng trọ không tồn tại hoặc đã bị xóa');
      }

      if (!unit.propertyId.equals(new Types.ObjectId(propertyId))) {
        throw new BadRequestException('Phòng trọ không thuộc về nhà trọ này');
      }
    }

    const filter: any = {
      propertyId: new Types.ObjectId(propertyId),
      deletedAt: null,
    };

    if (query.rentalUnitId) {
      filter.rentalUnitId = new Types.ObjectId(query.rentalUnitId);
    } else if (query.target === 'property') {
      filter.rentalUnitId = null;
    }

    if (query.rating !== undefined) {
      filter.rating = query.rating;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const total = await this.reviewModel.countDocuments(filter).exec();
    const totalPages = Math.ceil(total / limit) || 0;

    const reviews = await this.reviewModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'displayName deactivatedAt deletedAt')
      .exec();

    const items: PublicReviewItemDto[] = reviews.map((r) => {
      let displayName = 'Người dùng ẩn danh';

      if (!r.isAnonymous && r.userId) {
        const u = r.userId as any;
        if (u.deletedAt) {
          displayName = 'Tài khoản đã xóa';
        } else if (u.deactivatedAt) {
          displayName = 'Tài khoản đã bị vô hiệu hóa';
        } else if (u.displayName) {
          displayName = u.displayName;
        }
      }

      // Security: Strip Cloudinary publicId, only return type and url for presentation
      const safeMedia = (r.media || []).map((m) => ({
        type: m.type,
        url: m.url,
      }));

      return {
        id: r._id.toString(),
        propertyId: r.propertyId.toString(),
        rentalUnitId: r.rentalUnitId ? r.rentalUnitId.toString() : null,
        rating: r.rating,
        comment: r.comment || '',
        isAnonymous: r.isAnonymous,
        author: { displayName },
        media: safeMedia,
        createdAt: (r as any).createdAt,
        updatedAt: (r as any).updatedAt,
      };
    });

    return {
      summary,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Orphan Cleanup: Delete unattached media files older than specified hours
   */
  async cleanupOrphanMedia(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const orphans = await this.mediaUploadModel
      .find({
        reviewId: null,
        isAttached: false,
        isCleaningUp: { $ne: true },
        $or: [
          { createdAt: { $lt: cutoff } },
          { detachedAt: { $ne: null, $lt: cutoff } },
        ],
      })
      .exec();

    let deletedCount = 0;
    for (const orphan of orphans) {
      // Atomic claim for cleanup to prevent race conditions with concurrent operations
      const claimed = await this.mediaUploadModel.findOneAndUpdate(
        {
          _id: orphan._id,
          reviewId: null,
          isAttached: false,
          isCleaningUp: { $ne: true },
        },
        { $set: { isCleaningUp: true } },
        { new: true },
      );

      if (!claimed) continue;

      try {
        const isDestroyed = await this.mediaStorageService.destroyCloudinaryMedia(
          claimed.publicId,
          claimed.type,
        );

        if (isDestroyed) {
          await this.mediaUploadModel.deleteOne({ _id: claimed._id });
          deletedCount++;
        } else {
          // If Cloudinary destroy fails, reset lock and keep record for retry
          await this.mediaUploadModel.updateOne(
            { _id: claimed._id },
            { $set: { isCleaningUp: false } },
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Lỗi khi dọn dẹp file mồ côi ${claimed.publicId}: ${err.message}`,
        );
        await this.mediaUploadModel.updateOne(
          { _id: claimed._id },
          { $set: { isCleaningUp: false } },
        );
      }
    }

    return deletedCount;
  }
}
