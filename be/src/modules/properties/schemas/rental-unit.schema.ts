import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Property } from './property.schema.js';
import { User } from '../../users/schemas/user.schema.js';

export type RentalUnitDocument = HydratedDocument<RentalUnit>;

export function normalizeUnitName(unitName: string): string {
  if (!unitName) return '';
  return unitName.trim().replace(/\s+/g, ' ').toLowerCase();
}

@Schema({ timestamps: true, collection: 'rental_units' })
export class RentalUnit {
  @Prop({ type: Types.ObjectId, ref: Property.name, required: true, index: true })
  propertyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  unitName: string;

  @Prop({ required: true, trim: true })
  normalizedUnitName: string;

  @Prop({ type: Number, default: null })
  price?: number | null;

  @Prop({ type: Number, default: null })
  area?: number | null;

  @Prop({ type: String, default: '' })
  description?: string;

  @Prop({ type: [String], default: [] })
  amenities?: string[];

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const RentalUnitSchema = SchemaFactory.createForClass(RentalUnit);

// Compound Partial Unique Index for active rental units in a property
RentalUnitSchema.index(
  { propertyId: 1, normalizedUnitName: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

// Partial index for fetching active units by propertyId
RentalUnitSchema.index(
  { propertyId: 1 },
  { partialFilterExpression: { deletedAt: null } },
);
