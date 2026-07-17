import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../auth/decorators';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.metrics.getMetrics();
    res.setHeader('Content-Type', this.metrics.getContentType());
    res.send(body);
  }
}
