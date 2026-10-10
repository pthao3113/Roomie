import {
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryMapPropertyDto {
  // --- Mode 1: Radius Search ---
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Vĩ độ (lat) phải là số' })
  @Min(-90, { message: 'Vĩ độ (lat) phải từ -90 đến 90' })
  @Max(90, { message: 'Vĩ độ (lat) phải từ -90 đến 90' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Kinh độ (lng) phải là số' })
  @Min(-180, { message: 'Kinh độ (lng) phải từ -180 đến 180' })
  @Max(180, { message: 'Kinh độ (lng) phải từ -180 đến 180' })
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Bán kính (radius) phải là số nguyên' })
  @Min(1, { message: 'Bán kính tối thiểu là 1m' })
  @Max(10000, { message: 'Bán kính tối đa là 10,000m (10km)' })
  radius?: number;

  // --- Mode 2: Viewport Bounding Box Search ---
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'swLng phải là số' })
  @Min(-180, { message: 'swLng phải từ -180 đến 180' })
  @Max(180, { message: 'swLng phải từ -180 đến 180' })
  swLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'swLat phải là số' })
  @Min(-90, { message: 'swLat phải từ -90 đến 90' })
  @Max(90, { message: 'swLat phải từ -90 đến 90' })
  swLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'neLng phải là số' })
  @Min(-180, { message: 'neLng phải từ -180 đến 180' })
  @Max(180, { message: 'neLng phải từ -180 đến 180' })
  neLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'neLat phải là số' })
  @Min(-90, { message: 'neLat phải từ -90 đến 90' })
  @Max(90, { message: 'neLat phải từ -90 đến 90' })
  neLat?: number;

  // --- Common Limit ---
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit phải là số nguyên' })
  @Min(1, { message: 'Limit tối thiểu là 1' })
  @Max(100, { message: 'Limit tối đa là 100' })
  limit?: number = 50;
}
