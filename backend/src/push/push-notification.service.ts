import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private initialized = false;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@soniccoffee.com',
        publicKey,
        privateKey,
      );
      this.initialized = true;
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  async saveSubscription(staffId: string, subscription: Record<string, unknown>) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { branchId: true, cafeId: true },
    });
    if (!staff) throw new Error('Staff not found');
    await this.prisma.pushSubscription.upsert({
      where: { staffId },
      create: {
        cafeId: staff.cafeId,
        staffId,
        branchId: staff.branchId,
        subscription: subscription as any,
      } as any,
      update: { subscription: subscription as any },
    });
    this.logger.log(`Push subscription saved for staff ${staffId}`);
  }

  async removeSubscription(staffId: string) {
    try {
      await this.prisma.pushSubscription.delete({ where: { staffId } });
    } catch {
      // subscription may not exist
    }
  }

  async sendNotification(staffId: string, title: string, message: string, data?: Record<string, unknown>) {
    if (!this.initialized) return;

    try {
      const sub = await this.prisma.pushSubscription.findUnique({ where: { staffId } });
      if (!sub) return;

      const subscription = sub.subscription as unknown as webpush.PushSubscription;
      const payload = JSON.stringify({ title, message, data: data || {}, timestamp: new Date().toISOString() });

      await webpush.sendNotification(subscription, payload, { TTL: 86400 });
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 410 || error.statusCode === 404) {
        await this.removeSubscription(staffId);
      }
      this.logger.error(`Failed to send push to ${staffId}: ${(err as Error).message}`);
    }
  }

  async broadcastNotification(
    roleTarget: string,
    title: string,
    message: string,
    locale: string = 'en',
    data?: Record<string, unknown>,
  ) {
    if (!this.initialized) return;

    const staffList = await this.prisma.staff.findMany({
      where: { role: roleTarget === 'ALL' ? undefined : roleTarget, active: true, language: locale },
      select: { id: true },
    });

    await Promise.allSettled(
      staffList.map((staff) => this.sendNotification(staff.id, title, message, data)),
    );
  }
}




