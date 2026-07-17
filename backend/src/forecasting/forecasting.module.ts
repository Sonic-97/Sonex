import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForecastingController } from './forecasting.controller';
import { ForecastingModelService } from './forecasting-model.service';
import { ForecastingService } from './forecasting.service';

@Module({
  imports: [PrismaModule],
  controllers: [ForecastingController],
  providers: [ForecastingModelService, ForecastingService],
  exports: [ForecastingModelService, ForecastingService],
})
export class ForecastingModule {}
