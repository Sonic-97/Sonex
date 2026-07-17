import { Module } from '@nestjs/common';
import { PlayStationController } from './playstation.controller';
import { PlayStationService } from './playstation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlayStationController],
  providers: [PlayStationService],
  exports: [PlayStationService],
})
export class PlayStationModule {}
