import { Module } from '@nestjs/common';
import { NotificationPreferenceService } from './notification-preference.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationPreferenceService],
  exports: [NotificationPreferenceService],
})
export class NotificationPreferenceModule {}
