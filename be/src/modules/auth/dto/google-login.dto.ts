import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString({ message: 'idToken phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;
}
