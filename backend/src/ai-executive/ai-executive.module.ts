import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MorningBriefService } from './application/morning-brief.service';
import { AIExecutiveController } from './presentation/ai-executive.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AIExecutiveController],
  providers: [MorningBriefService],
  exports: [MorningBriefService],
})
export class AIExecutiveModule {}
