import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransactionalOutboxService } from './application/transactional-outbox.service';
import { OutboxProcessorWorker } from './infrastructure/outbox-processor.worker';
import { TransactionalOutboxController } from './presentation/transactional-outbox.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TransactionalOutboxController],
  providers: [TransactionalOutboxService, OutboxProcessorWorker],
  exports: [TransactionalOutboxService, OutboxProcessorWorker],
})
export class TransactionalOutboxModule {}
