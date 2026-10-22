import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { DigitalPaymentService } from './digital-payment.service';
import {
  UpdatePaymentConfigDto,
  SubmitPaymentReferenceDto,
  VerifyPaymentTransactionDto,
} from './dto/digital-payment.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, cafeId } from '../auth/decorators';

@Controller()
export class OwnerPaymentSettingsController {
  constructor(private readonly digitalPaymentService: DigitalPaymentService) {}

  /**
   * 1. GET /owner/payment-settings
   * Retrieve active payment accounts (InstaPay, Wallets, Paymob) for the cafe.
   */
  @Get('owner/payment-settings')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async getPaymentSettings(@cafeId() headerCafeId?: string, @Req() req?: any) {
    const cafeId = headerCafeId || req?.user?.cafeId;
    if (!cafeId) throw new ForbiddenException('Cafe context required');
    return this.digitalPaymentService.getPaymentConfig(cafeId);
  }

  /**
   * 2. POST /owner/payment-settings
   * Update payment configuration (IPA, phone numbers, gateway keys).
   */
  @Post('owner/payment-settings')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  async updatePaymentSettings(
    @Body() dto: UpdatePaymentConfigDto,
    @cafeId() headerCafeId?: string,
    @Req() req?: any,
  ) {
    const cafeId = headerCafeId || req?.user?.cafeId;
    if (!cafeId) throw new ForbiddenException('Cafe context required');
    return this.digitalPaymentService.updatePaymentConfig(cafeId, dto);
  }

  /**
   * 3. GET /owner/payment-settings/transactions
   * Live transaction verification queue for Owner/Cashier.
   */
  @Get('owner/payment-settings/transactions')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  async getTransactions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @cafeId() headerCafeId?: string,
    @Req() req?: any,
  ) {
    const cafeId = headerCafeId || req?.user?.cafeId;
    if (!cafeId) throw new ForbiddenException('Cafe context required');
    return this.digitalPaymentService.getTransactions(cafeId, {
      status,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * 4. POST /owner/payment-settings/verify/:transactionId
   * Approve or reject a digital payment transaction.
   */
  @Post('owner/payment-settings/verify/:transactionId')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  @HttpCode(HttpStatus.OK)
  async verifyTransaction(
    @Param('transactionId') transactionId: string,
    @Body() dto: VerifyPaymentTransactionDto,
    @cafeId() headerCafeId?: string,
    @Req() req?: any,
  ) {
    const cafeId = headerCafeId || req?.user?.cafeId;
    if (!cafeId) throw new ForbiddenException('Cafe context required');
    const staffId = req?.user?.id || req?.user?.userId || 'SYSTEM';
    return this.digitalPaymentService.verifyTransaction(cafeId, transactionId, staffId, dto);
  }

  /**
   * 5. GET /payments/options/:orderId
   * Customer / Order endpoint: Generates dynamic InstaPay QR, Smart Wallets, and links for an order.
   */
  @Get('payments/options/:orderId')
  async getPaymentOptions(
    @Param('orderId') orderId: string,
    @Query('cafeId') queryCafeId?: string,
    @cafeId() headerCafeId?: string,
    @Req() req?: any,
  ) {
    const resolvedCafeId = queryCafeId || headerCafeId || req?.user?.cafeId;
    if (!resolvedCafeId) {
      throw new BadRequestException('cafeId is required to query payment options');
    }
    return this.digitalPaymentService.getPaymentOptions(resolvedCafeId, orderId);
  }

  /**
   * 6. POST /payments/submit-reference/:orderId
   * Customer / WhatsApp endpoint: Submits transfer reference number into verification queue.
   */
  @Post('payments/submit-reference/:orderId')
  @HttpCode(HttpStatus.OK)
  async submitPaymentReference(
    @Param('orderId') orderId: string,
    @Body() dto: SubmitPaymentReferenceDto,
    @Query('cafeId') queryCafeId?: string,
    @cafeId() headerCafeId?: string,
    @Req() req?: any,
  ) {
    const resolvedCafeId = queryCafeId || headerCafeId || req?.user?.cafeId;
    if (!resolvedCafeId) {
      throw new BadRequestException('cafeId is required to submit payment reference');
    }
    return this.digitalPaymentService.submitPaymentReference(resolvedCafeId, orderId, dto);
  }

  /**
   * 7. POST /payments/paymob-webhook
   * Webhook listener for Paymob transaction updates.
   */
  @Post('payments/paymob-webhook')
  @HttpCode(HttpStatus.OK)
  async handlePaymobWebhook(@Body() payload: any) {
    return this.digitalPaymentService.handlePaymobWebhook(payload);
  }
}
