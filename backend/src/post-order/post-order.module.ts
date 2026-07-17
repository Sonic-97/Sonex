import { Module } from '@nestjs/common';
import { PostOrderService } from './post-order.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  providers: [PostOrderService],
  exports: [PostOrderService],
})
export class PostOrderModule {}
