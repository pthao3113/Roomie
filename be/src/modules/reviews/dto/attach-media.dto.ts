import { IsString, IsNotEmpty } from 'class-validator';

export class AttachMediaDto {
  @IsString({ message: 'publicId phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'publicId không được để trống' })
  publicId: string;
}
