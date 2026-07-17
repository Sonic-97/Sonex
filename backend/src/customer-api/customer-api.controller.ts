import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { CustomerApiService } from './customer-api.service';
import { CustomerApiAuthGuard } from './customer-api-auth.guard';
import { CustomerLoginRequest, CustomerMessageRequest, CustomerConfirmRequest, AuthPayload } from './customer-api.types';

@Controller('customer')
export class CustomerApiController {
  constructor(private readonly api: CustomerApiService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: CustomerLoginRequest) {
    return this.api.login(body);
  }

  @Post('message')
  @UseGuards(CustomerApiAuthGuard)
  async sendMessage(@Body() body: CustomerMessageRequest, @Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.processMessage(payload, body);
  }

  @Post('confirm')
  @UseGuards(CustomerApiAuthGuard)
  async confirm(@Body() body: CustomerConfirmRequest, @Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.confirm(payload, body);
  }

  @Post('cancel')
  @UseGuards(CustomerApiAuthGuard)
  async cancelOrder(@Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.cancelOrder(payload);
  }

  @Get('orders')
  @UseGuards(CustomerApiAuthGuard)
  async getOrders(@Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getOrders(payload);
  }

  @Get('orders/:id')
  @UseGuards(CustomerApiAuthGuard)
  async getOrder(@Param('id') id: string, @Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getOrder(payload, id);
  }

  @Get('history')
  @UseGuards(CustomerApiAuthGuard)
  async getHistory(@Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getHistory(payload);
  }

  @Get('recommendations')
  @UseGuards(CustomerApiAuthGuard)
  async getRecommendations(@Req() req: any) {
    const payload = req.customerPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getRecommendations(payload);
  }
}
