import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import 'multer';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReviewsService } from './reviews.service.js';
import { MediaStorageService } from './media-storage.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly mediaStorageService: MediaStorageService,
  ) {}

  /**
   * Upload media files (images/video) for reviews (Authenticated)
   */
  @Post('reviews/media/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 6))
  async uploadMedia(
    @CurrentUser() user: UserDocument,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một tệp để tải lên');
    }

    if (files.length > 6) {
      throw new BadRequestException('Mỗi lần tải lên tối đa 6 tệp (tối đa 5 ảnh, 1 video)');
    }

    const uploadedResults = [];
    for (const file of files) {
      const savedDoc = await this.mediaStorageService.processAndSaveUpload(
        file,
        user._id.toString(),
      );
      uploadedResults.push({
        type: savedDoc.type,
        url: savedDoc.url,
        publicId: savedDoc.publicId,
      });
    }

    return uploadedResults;
  }

  /**
   * Create a new Review for a Property or a RentalUnit (Authenticated)
   */
  @Post('properties/:propertyId/reviews')
  @UseGuards(JwtAuthGuard)
  async createReview(
    @Param('propertyId') propertyId: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(
      propertyId,
      user._id.toString(),
      dto,
    );
  }

  /**
   * Update an existing active Review (Authenticated, author only)
   */
  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard)
  async updateReview(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(
      id,
      user._id.toString(),
      dto,
    );
  }

  /**
   * Soft-delete an active Review (Authenticated, author only)
   */
  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  async deleteReview(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.reviewsService.deleteReview(
      id,
      user._id.toString(),
    );
  }
}
