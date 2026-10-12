import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from './schemas/review.schema.js';
import {
  MediaUpload,
  MediaUploadSchema,
} from './schemas/media-upload.schema.js';
import { Property, PropertySchema } from '../properties/schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitSchema,
} from '../properties/schemas/rental-unit.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { ReviewsService } from './reviews.service.js';
import { ReviewsController } from './reviews.controller.js';
import { MediaStorageService } from './media-storage.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: MediaUpload.name, schema: MediaUploadSchema },
      { name: Property.name, schema: PropertySchema },
      { name: RentalUnit.name, schema: RentalUnitSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, MediaStorageService],
  exports: [ReviewsService, MediaStorageService],
})
export class ReviewsModule {}
