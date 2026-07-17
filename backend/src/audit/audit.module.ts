import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogController } from './audit.controller';
import { AuditConsumer } from './audit.consumer';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditLogController],
  providers: [AuditService, AuditConsumer],
  exports: [AuditService],
})
export class AuditModule {}
