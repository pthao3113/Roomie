import {
  IsInt,
  Min,
  Max,
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsInt({ message: 'Rating phải là số nguyên' })
  @Min(1, { message: 'Rating tối thiểu là 1 sao' })
  @Max(5, { message: 'Rating tối đa là 5 sao' })
  rating?: number;

  @IsOptional()
  @IsString({ message: 'Nội dung đánh giá phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Nội dung đánh giá tối đa 2000 ký tự' })
  comment?: string;

  @IsOptional()
  @IsBoolean({ message: 'isAnonymous phải là giá trị boolean' })
  isAnonymous?: boolean;
}
