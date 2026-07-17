import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OWNER_ACTION_TYPES, OwnerActionChannel, OwnerActionType } from './owner-action.types';

export class CreateOwnerActionProposalDto {
  @IsIn(OWNER_ACTION_TYPES)
  actionType!: OwnerActionType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceId?: string;

  @IsObject()
  proposedState!: Record<string, unknown>;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestedText?: string;
}

export class ApproveOwnerActionDto {
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  approvalText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  confirmationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class RejectOwnerActionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class EditOwnerActionDto {
  @IsObject()
  proposedState!: Record<string, unknown>;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class TelegramOwnerApprovalDto {
  @IsString()
  @MaxLength(100)
  proposalId!: string;

  @IsString()
  @MaxLength(120)
  approvalText!: string;

  @IsString()
  @MaxLength(160)
  updateId!: string;

  @Type(() => Boolean)
  @IsBoolean()
  isLinkedOwner!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  isGroup!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  isForwarded!: boolean;
}

export interface OwnerActionApprovalInput {
  approvalText: string;
  confirmationCode?: string;
  idempotencyKey?: string;
  channel: OwnerActionChannel;
}

