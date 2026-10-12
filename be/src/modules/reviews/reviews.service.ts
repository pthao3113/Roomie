import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
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
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
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
    private readonly mediaStorageService: MediaStorageService,
  ) {}

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
      return await review.save();
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

    return await review.save();
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
    return await review.save();
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
