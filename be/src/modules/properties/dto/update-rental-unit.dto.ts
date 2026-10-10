import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateRentalUnitDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Tên phòng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên phòng không được để trống hoặc chỉ chứa khoảng trắng' })
  @MaxLength(50, { message: 'Tên phòng không được vượt quá 50 ký tự' })
  unitName?: string;

  @IsOptional()
  @ValidateIf((o, value) => value !== null && value !== undefined)
  @IsInt({ message: 'Giá phòng phải là số nguyên (VND/tháng)' })
  @Min(1, { message: 'Giá phòng phải lớn hơn hoặc bằng 1' })
  price?: number | null;

  @IsOptional()
  @ValidateIf((o, value) => value !== null && value !== undefined)
  @IsNumber({}, { message: 'Diện tích phòng phải là số' })
  @Min(0.01, { message: 'Diện tích phòng phải lớn hơn 0' })
  area?: number | null;

  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'Tiện ích phải là mảng danh sách chuỗi' })
  @IsString({ each: true, message: 'Mỗi tiện ích phải là chuỗi ký tự' })
  amenities?: string[];
}
