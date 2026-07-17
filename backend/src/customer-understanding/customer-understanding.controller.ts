import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles, cafeId } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CustomerUnderstandingService } from './customer-understanding.service';
import { ProductUnderstandingTagService } from './product-understanding-tag.service';

type AuthenticatedRequest = Request & { user?: { id?: string; role?: string }; branchId?: string };

@Controller('customer-understanding')
@UseGuards(RolesGuard)
@Roles('OWNER', 'MANAGER')
export class CustomerUnderstandingController {
  constructor(
    private readonly understanding: CustomerUnderstandingService,
    private readonly tags: ProductUnderstandingTagService,
  ) {}

  @Get('product-tags')
  listTags(@cafeId() tenantId: string, @Req() request: AuthenticatedRequest) {
    return this.tags.list(tenantId, request.branchId);
  }

  @Put('product-tags/:productId')
  @Roles('OWNER')
  replaceTags(
    @cafeId() tenantId: string,
    @Param('productId') productId: string,
    @Body() body: { tags: unknown },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.tags.replace(tenantId, productId, body.tags, request.user || {});
  }

  @Put('feedback')
  feedback(@cafeId() tenantId: string, @Body() body: { useful: boolean }) {
    return this.understanding.recordFeedback(tenantId, body.useful === true);
  }

  @Get('metrics')
  @Roles('OWNER')
  metrics(@cafeId() tenantId: string) {
    return this.understanding.getMetrics(tenantId);
  }
}
