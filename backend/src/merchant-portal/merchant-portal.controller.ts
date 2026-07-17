import { Controller, Post, Get, Put, Body, Param, UseGuards, HttpCode, HttpStatus, Req, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MerchantPortalService } from './merchant-portal.service';
import { MerchantPortalAuthGuard } from './merchant-portal-auth.guard';
import { LoginRequest, MerchantActionRequest, AvailabilityUpdateRequest, AuthPayload } from './merchant-portal.types';

@Controller('merchant')
export class MerchantPortalController {
  constructor(private readonly portal: MerchantPortalService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequest) {
    return this.portal.login(body);
  }

  @Get('orders/:merchantOrderId')
  @UseGuards(MerchantPortalAuthGuard)
  async getOrder(@Param('merchantOrderId') merchantOrderId: string, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    const history = await this.portal.getOrderHistory(merchantOrderId, payload.merchantId);
    if (!history || history.length === 0) throw new NotFoundException('Order not found or access denied');
    return { merchantOrderId, merchantId: payload.merchantId, messages: history };
  }

  @Post('orders/:merchantOrderId/accept')
  @UseGuards(MerchantPortalAuthGuard)
  async acceptOrder(@Param('merchantOrderId') merchantOrderId: string, @Body() body: MerchantActionRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.acceptOrder(payload.merchantId, merchantOrderId, body.customerOrderId, payload.cafeId);
  }

  @Post('orders/:merchantOrderId/reject')
  @UseGuards(MerchantPortalAuthGuard)
  async rejectOrder(@Param('merchantOrderId') merchantOrderId: string, @Body() body: MerchantActionRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.rejectOrder(payload.merchantId, merchantOrderId, body.customerOrderId, payload.cafeId, body.reason);
  }

  @Post('orders/:merchantOrderId/preparing')
  @UseGuards(MerchantPortalAuthGuard)
  async startPreparing(@Param('merchantOrderId') merchantOrderId: string, @Body() body: MerchantActionRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.startPreparing(payload.merchantId, merchantOrderId, body.customerOrderId, payload.cafeId);
  }

  @Post('orders/:merchantOrderId/ready')
  @UseGuards(MerchantPortalAuthGuard)
  async markReady(@Param('merchantOrderId') merchantOrderId: string, @Body() body: MerchantActionRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.markReady(payload.merchantId, merchantOrderId, body.customerOrderId, payload.cafeId);
  }

  @Post('orders/:merchantOrderId/delay')
  @UseGuards(MerchantPortalAuthGuard)
  async delayOrder(@Param('merchantOrderId') merchantOrderId: string, @Body() body: MerchantActionRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.delayOrder(payload.merchantId, merchantOrderId, body.customerOrderId, payload.cafeId, body.extraMinutes || 5);
  }

  @Post('orders/:merchantOrderId/out-of-stock')
  @UseGuards(MerchantPortalAuthGuard)
  async outOfStock(@Param('merchantOrderId') merchantOrderId: string, @Body() body: MerchantActionRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.reportOutOfStock(payload.merchantId, merchantOrderId, body.customerOrderId, payload.cafeId, body.productName || 'Unknown');
  }

  @Get('availability')
  @UseGuards(MerchantPortalAuthGuard)
  async getAvailability(@Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    const data = await this.portal.getAvailability(payload.cafeId);
    if (!data) throw new NotFoundException('Availability not found');
    return data;
  }

  @Put('availability')
  @UseGuards(MerchantPortalAuthGuard)
  async updateAvailability(@Body() body: AvailabilityUpdateRequest, @Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    return this.portal.updateAvailability(payload.cafeId, body);
  }

  @Get('reputation')
  @UseGuards(MerchantPortalAuthGuard)
  async getReputation(@Req() req: any) {
    const payload = req.merchantPayload as AuthPayload;
    const [score, badges, alerts] = await Promise.all([
      this.portal.getReputation(payload.merchantId),
      this.portal.getBadges(payload.merchantId),
      this.portal.getQualityAlerts(payload.merchantId),
    ]);
    return { merchantId: payload.merchantId, score, badges, alerts };
  }
}
