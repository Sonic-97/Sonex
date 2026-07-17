import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CafeGuard } from '../auth/guards/cafe.guard';
import { cafeId } from '../auth/decorators/cafe-id.decorator';
import { Public } from '../auth/decorators/public.decorator';

@UseGuards(JwtAuthGuard, CafeGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // Customer wallet
  @Get('wallet/:customerId')
  async getWallet(@cafeId() cafeId: string, @Param('customerId') customerId: string) {
    return this.loyaltyService.getWallet(cafeId, customerId);
  }

  // Customer tier
  @Get('tier/:customerId')
  async getTier(@cafeId() cafeId: string, @Param('customerId') customerId: string) {
    return this.loyaltyService.getCustomerTier(cafeId, customerId);
  }

  // Redeem reward
  @Post('redeem')
  async redeemReward(
    @cafeId() cafeId: string,
    @Body() body: { customerId: string; ruleId: string },
  ) {
    return this.loyaltyService.redeemReward(cafeId, body.customerId, body.ruleId);
  }

  // Owner: create rule
  @Post('rules')
  async createRule(@cafeId() cafeId: string, @Body() body: any) {
    return this.loyaltyService.createRule(cafeId, body);
  }

  // Owner: list rules
  @Get('rules')
  async getRules(@cafeId() cafeId: string) {
    return this.loyaltyService.getAllRules(cafeId);
  }

  // Owner: update rule
  @Patch('rules/:ruleId')
  async updateRule(@cafeId() cafeId: string, @Param('ruleId') ruleId: string, @Body() body: any) {
    return this.loyaltyService.updateRule(ruleId, cafeId, body);
  }

  // Owner: analytics
  @Get('analytics')
  async getAnalytics(@cafeId() cafeId: string) {
    return this.loyaltyService.getLoyaltyAnalytics(cafeId);
  }

  // Trigger order processing (called from order service)
  @Public()
  @Post('process-order')
  async processOrder(@Body() body: { orderId: string; cafeId: string; customerId: string }) {
    await this.loyaltyService.processOrderDelivered(body.orderId, body.cafeId, body.customerId);
    return { success: true };
  }
}
