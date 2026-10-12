import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { Review } from './review.schema.js';

export type MediaUploadDocument = HydratedDocument<MediaUpload>;

@Schema({ timestamps: true, collection: 'media_uploads' })
export class MediaUpload {
  @Prop({ required: true, unique: true, trim: true })
  publicId: string;

  @Prop({ required: true, trim: true })
  url: string;

  @Prop({ required: true, enum: ['image', 'video'] })
  type: 'image' | 'video';

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Review.name, default: null, index: true })
  reviewId?: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false, index: true })
  isAttached: boolean;

  @Prop({ type: Date, default: null, index: true })
  detachedAt?: Date | null;

  @Prop({ type: Boolean, default: false, index: true })
  isCleaningUp?: boolean;
}

export const MediaUploadSchema = SchemaFactory.createForClass(MediaUpload);

// Index for orphan cleanup query: reviewId is null, not attached, isCleaningUp is false
MediaUploadSchema.index(
  { reviewId: 1, isAttached: 1, isCleaningUp: 1, createdAt: 1 },
);
