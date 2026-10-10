import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class UpdatePropertyDto {
  @IsOptional()
  @IsString({ message: 'Tên nhà trọ phải là chuỗi ký tự' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ nhà trọ phải là chuỗi ký tự' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'Tiện ích phải là mảng danh sách chuỗi' })
  @IsString({ each: true, message: 'Mỗi tiện ích phải là chuỗi ký tự' })
  amenities?: string[];

  @IsOptional()
  @IsBoolean({ message: 'confirmDuplicate phải là giá trị boolean' })
  confirmDuplicate?: boolean;
}
