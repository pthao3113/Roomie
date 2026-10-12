import {
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryReviewDto {
  @IsOptional()
  @IsMongoId({ message: 'ID phòng trọ không đúng định dạng' })
  rentalUnitId?: string;

  @IsOptional()
  @IsIn(['all', 'property'], { message: 'target phải là all hoặc property' })
  target?: 'all' | 'property';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số sao phải là số nguyên' })
  @Min(1, { message: 'Số sao tối thiểu là 1' })
  @Max(5, { message: 'Số sao tối đa là 5' })
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng mục trên trang phải là số nguyên' })
  @Min(1, { message: 'Số lượng mục tối thiểu là 1' })
  @Max(50, { message: 'Số lượng mục tối đa là 50' })
  limit?: number = 10;
}
