import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OwnerCopilotAskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sessionId?: string;
}

export class OwnerCopilotFeedbackDto {
  @IsString()
  @MaxLength(80)
  contextId!: string;

  @IsIn(['USEFUL', 'NOT_USEFUL', 'WRONG_NUMBERS', 'TOO_LONG'])
  feedback!: 'USEFUL' | 'NOT_USEFUL' | 'WRONG_NUMBERS' | 'TOO_LONG';
}
