import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreatePropertyDto {
  @IsString({ message: 'Tên nhà trọ phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên nhà trọ không được để trống' })
  name: string;

  @IsString({ message: 'Địa chỉ nhà trọ phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Địa chỉ nhà trọ không được để trống' })
  address: string;

  // GeoJSON coordinates array: [longitude, latitude]
  @IsArray({ message: 'Tọa độ phải là mảng gồm 2 phần tử [kinh độ, vĩ độ]' })
  @ArrayMinSize(2, { message: 'Tọa độ phải gồm 2 phần tử [kinh độ, vĩ độ]' })
  @ArrayMaxSize(2, { message: 'Tọa độ phải gồm 2 phần tử [kinh độ, vĩ độ]' })
  @IsNumber({}, { each: true, message: 'Tọa độ phải là số hợp lệ' })
  @Min(-180, { each: true, message: 'Kinh độ phải từ -180 đến 180' })
  @Max(180, { each: true, message: 'Kinh độ phải từ -180 đến 180' })
  coordinates: number[];

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
