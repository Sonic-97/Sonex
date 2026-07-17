import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { cafeId } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CafeGuard } from '../auth/guards/cafe.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, CafeGuard, RolesGuard)
export class AuditLogController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('OWNER')
  async findAll(@cafeId() cafeId: string, @Query() query: AuditLogQueryDto) {
    return this.auditService.search(cafeId, {
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      from: query.from,
      to: query.to,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }
}
