import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { COMMUNITY_CONFIG } from '../community.config.js';

export class QueryMyConfirmationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng mục trên trang phải là số nguyên' })
  @Min(1, { message: 'Số lượng mục tối thiểu là 1' })
  @Max(COMMUNITY_CONFIG.pagination.maxLimit, {
    message: `Số lượng mục tối đa là ${COMMUNITY_CONFIG.pagination.maxLimit}`,
  })
  limit?: number = COMMUNITY_CONFIG.pagination.defaultLimit;
}
