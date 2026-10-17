import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { Property } from '../../properties/schemas/property.schema.js';

export type ConfirmationDocument = HydratedDocument<Confirmation>;

export const CONFIRMATION_TARGET_TYPES = ['property', 'rental_unit'] as const;
export type ConfirmationTargetType = (typeof CONFIRMATION_TARGET_TYPES)[number];

/**
 * A community confirmation is a SIGNAL only. It is not proof of tenancy,
 * does not affect averageRating/reviewCount and never produces a "Verified" label.
 *
 * Withdrawal soft-deletes the record (deletedAt). Re-confirming always inserts a NEW
 * record so that createdAt-based rate limiting cannot be bypassed by toggling.
 */
@Schema({ timestamps: true, collection: 'confirmations' })
export class Confirmation {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: CONFIRMATION_TARGET_TYPES, required: true })
  targetType: ConfirmationTargetType;

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Property.name, required: true })
  propertyId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const ConfirmationSchema = SchemaFactory.createForClass(Confirmation);

// 1 active confirmation per user per target
ConfirmationSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

// Counting active confirmations of a target
ConfirmationSchema.index(
  { targetType: 1, targetId: 1 },
  { partialFilterExpression: { deletedAt: null } },
);

// Rate limit (counts ALL records incl. withdrawn) and "my confirmations" listing
ConfirmationSchema.index({ userId: 1, createdAt: -1 });
