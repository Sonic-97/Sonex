import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { TenantWhatsAppController } from './tenant-whatsapp.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [NotificationsModule, PrismaModule],
  providers: [WhatsappService],
  controllers: [WhatsappController, TenantWhatsAppController],
  exports: [WhatsappService],
})
export class WhatsappModule {}




