import { IsNotEmpty, IsString } from 'class-validator';

export class ReactivateAccountDto {
  @IsString({ message: 'reactivationToken phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'reactivationToken không được để trống' })
  reactivationToken: string;
}
