import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators';
import { HealthIndicatorsService } from './health-indicators.service';

@Controller()
export class HealthController {
  constructor(private readonly hc: HealthIndicatorsService) {}

  @Public()
  @Get('health')
  async checkHealth() {
    return this.hc.checkAll();
  }

  @Public()
  @Get('ready')
  async ready() {
    const result = await this.hc.checkAll();
    if (result.status === 'down') {
      const response = { status: 'not_ready', components: result.components, timestamp: result.timestamp };
      return response;
    }
    return { status: 'ready', components: result.components, timestamp: result.timestamp };
  }

  @Public()
  @Get('live')
  live() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }
}
