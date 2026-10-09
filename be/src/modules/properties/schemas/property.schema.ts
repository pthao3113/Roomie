import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GeoJSONPoint, GeoJSONPointSchema } from './geojson-point.schema.js';
import { User } from '../../users/schemas/user.schema.js';

export type PropertyDocument = HydratedDocument<Property>;

@Schema({ timestamps: true, collection: 'properties' })
export class Property {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, trim: true })
  normalizedAddress: string;

  @Prop({ type: GeoJSONPointSchema, required: true })
  location: GeoJSONPoint;

  @Prop({ type: String, default: '' })
  description?: string;

  @Prop({ type: [String], default: [] })
  amenities?: string[];

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const PropertySchema = SchemaFactory.createForClass(Property);

// 1. Spatial Index 2dsphere for radius & viewport map queries
PropertySchema.index({ location: '2dsphere' });

// 2. Non-unique index for normalizedAddress lookup on active properties
PropertySchema.index(
  { normalizedAddress: 1 },
  { partialFilterExpression: { deletedAt: null } },
);

// 3. Index for creator lookup on active properties
PropertySchema.index(
  { createdBy: 1 },
  { partialFilterExpression: { deletedAt: null } },
);
