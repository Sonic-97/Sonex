import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerActionExecutorService } from './owner-action-executor.service';
import { OwnerActionPolicyService } from './owner-action-policy.service';
import { OwnerActionReaderService } from './owner-action-reader.service';
import { OwnerActionStoreService } from './owner-action-store.service';
import { OwnerActionsController } from './owner-actions.controller';
import { OwnerActionsService } from './owner-actions.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [OwnerActionsController],
  providers: [
    OwnerActionsService,
    OwnerActionPolicyService,
    OwnerActionReaderService,
    OwnerActionStoreService,
    OwnerActionExecutorService,
  ],
  exports: [OwnerActionsService, OwnerActionPolicyService, OwnerActionStoreService],
})
export class OwnerActionsModule {}

