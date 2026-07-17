import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushNotificationService } from './push-notification.service';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushNotificationController {
  constructor(private readonly pushService: PushNotificationService) {}

  @Post('subscribe')
  async subscribe(@Body('subscription') subscription: Record<string, unknown>, @Req() req: any) {
    await this.pushService.saveSubscription(req.user.id, subscription);
    return { success: true };
  }

  @Post('unsubscribe')
  async unsubscribe(@Req() req: any) {
    await this.pushService.removeSubscription(req.user.id);
    return { success: true };
  }
}




