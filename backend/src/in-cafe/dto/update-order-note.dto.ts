import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderNoteDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
