import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Property } from '../../properties/schemas/property.schema.js';
import { RentalUnit } from '../../properties/schemas/rental-unit.schema.js';
import { User } from '../../users/schemas/user.schema.js';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ _id: false })
export class ReviewMedia {
  @Prop({ required: true, enum: ['image', 'video'] })
  type: 'image' | 'video';

  @Prop({ required: true, trim: true })
  url: string;

  @Prop({ required: true, trim: true })
  publicId: string;
}

export const ReviewMediaSchema = SchemaFactory.createForClass(ReviewMedia);

@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ type: Types.ObjectId, ref: Property.name, required: true, index: true })
  propertyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: RentalUnit.name, default: null, index: true })
  rentalUnitId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating phải là số nguyên từ 1 đến 5',
    },
  })
  rating: number;

  @Prop({ type: String, default: '', trim: true, maxlength: 2000 })
  comment?: string;

  @Prop({ type: Boolean, default: false })
  isAnonymous: boolean;

  @Prop({ type: [ReviewMediaSchema], default: [] })
  media: ReviewMedia[];

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Compound Partial Unique Index: 1 active review per user per target (Property or RentalUnit)
ReviewSchema.index(
  { propertyId: 1, userId: 1, rentalUnitId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

// Query indexes for listing reviews
ReviewSchema.index(
  { propertyId: 1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null } },
);

ReviewSchema.index(
  { rentalUnitId: 1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
