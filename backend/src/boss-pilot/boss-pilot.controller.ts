import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { BossIntegrationService } from './boss-integration.service';
import { BossCafeOrderDto } from './dto/boss-cafe-order.dto';

@Controller('api/v1/boss-pilot')
export class BossPilotController {
  constructor(private readonly service: BossIntegrationService) {}

  @Post('place-order')
  async placeOrder(@Body() dto: BossCafeOrderDto) {
    const res = await this.service.placeBossCafeOrder(dto);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value;
  }
}
