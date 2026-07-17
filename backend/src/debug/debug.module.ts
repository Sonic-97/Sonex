import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [DebugController],
})
export class DebugModule {}
