import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService, AuditLogInput } from './audit.service';

@Injectable()
export class AuditConsumer {
  private readonly logger = new Logger(AuditConsumer.name);

  constructor(private readonly auditService: AuditService) {}

  @OnEvent('audit.log')
  async handle(payload: AuditLogInput): Promise<void> {
    try {
      await this.auditService.log(payload);
    } catch (err) {
      this.logger.error(`Async audit log failed: ${(err as Error).message}`);
    }
  }
}
