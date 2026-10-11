import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema.js';
import { Property, PropertyDocument } from '../properties/schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitDocument,
} from '../properties/schemas/rental-unit.schema.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(RentalUnit.name)
    private readonly rentalUnitModel: Model<RentalUnitDocument>,
  ) {}

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

    const review = new this.reviewModel({
      propertyId: new Types.ObjectId(propertyId),
      rentalUnitId: rentalUnitObjectId,
      userId: new Types.ObjectId(userId),
      rating: dto.rating,
      comment: dto.comment ? dto.comment.trim() : '',
      isAnonymous: dto.isAnonymous ?? false,
      media: [],
      deletedAt: null,
    });

    try {
      return await review.save();
    } catch (error: any) {
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

    return await review.save();
  }

  /**
   * Soft-delete an active Review (Only review author)
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
}
