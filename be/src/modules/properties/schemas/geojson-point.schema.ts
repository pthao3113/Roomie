import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class GeoJSONPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point', required: true })
  type: string;

  // [longitude, latitude]
  @Prop({ type: [Number], required: true })
  coordinates: number[];
}

export const GeoJSONPointSchema = SchemaFactory.createForClass(GeoJSONPoint);
