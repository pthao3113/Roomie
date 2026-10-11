import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from './schemas/review.schema.js';
import { Property, PropertySchema } from '../properties/schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitSchema,
} from '../properties/schemas/rental-unit.schema.js';
import { ReviewsService } from './reviews.service.js';
import { ReviewsController } from './reviews.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Property.name, schema: PropertySchema },
      { name: RentalUnit.name, schema: RentalUnitSchema },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
