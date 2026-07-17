import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsEngineService } from './analytics-engine.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AnalyticsEngineService],
  exports: [AnalyticsEngineService],
})
export class AnalyticsEngineModule {}
