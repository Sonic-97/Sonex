import { IsString, IsOptional, IsUUID } from 'class-validator';

export class ConfirmImportDto {
  @IsUUID()
  sessionId: string;
}
