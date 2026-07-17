import { Module, Global } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [PrismaModule, EventsModule],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
