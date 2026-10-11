import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

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
