import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { TransactionalOutboxService } from '../application/transactional-outbox.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

@Controller('api/v1/outbox')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class TransactionalOutboxController {
  constructor(private readonly outboxService: TransactionalOutboxService) {}

  @Get('pending')
  async getPendingEvents(
    @Query('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
  ) {
    if (!tenantId || !branchId) {
      throw new BadRequestException('tenantId and branchId query parameters are required.');
    }

    const res = await this.outboxService.fetchPendingEvents(tenantId, branchId);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }

    return res.value;
  }
}
