import { IsMongoId } from 'class-validator';

export class ConfirmationTargetParamDto {
  @IsMongoId({ message: 'ID không đúng định dạng' })
  id: string;
}
