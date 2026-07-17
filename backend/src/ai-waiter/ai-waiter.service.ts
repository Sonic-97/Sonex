import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';

export interface PendingAiWaiterOffer {
  phone: string;
  cafeId: string;
  customerId: string;
  customerName: string;
  favoriteProduct: string;
  sentAt: Date;
}

@Injectable()
export class AiWaiterService {
  private readonly logger = new Logger(AiWaiterService.name);
  private readonly pendingOffers = new Map<string, PendingAiWaiterOffer>();
  private readonly OFFER_TTL_MS = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
  ) {}

  async trySendProactive(cafeId: string, customerId: string): Promise<boolean> {
    try {
      const habit = await this.prisma.customerHabit.findFirst({
        where: { customerId, cafeId },
        include: {
          customer: { select: { id: true, name: true, telegramId: true, phone: true } },
        },
      });
      if (!habit?.aiWaiterActive || !habit.usualTime) return false;

      if (habit.lastProactiveSentAt) {
        const today = new Date();
        const sentDay = new Date(habit.lastProactiveSentAt);
        if (sentDay.toDateString() === today.toDateString()) return false;
      }

      if (!habit.customer) return false;

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const [existingOrders, existingCafeOrders] = await Promise.all([
        this.prisma.order.findFirst({
          where: { cafeId, customerId, createdAt: { gte: todayStart } },
          select: { id: true },
        }),
        this.prisma.inCafeOrder.findFirst({
          where: { cafeId, customerId, createdAt: { gte: todayStart } },
          select: { id: true },
        }),
      ]);
      if (existingOrders || existingCafeOrders) return false;

      const productName = habit.favoriteProductName || 'مشروبك المفضل';
      const customerName = habit.customer.name || 'عميل';

      const message = `☀️ صباح الخير يا ${customerName}\n\nكالعادة بتحب:\n☕ ${productName}\n\nتحب نبدأ تجهيزها؟\n\n1️⃣ نعم\n2️⃣ لا\n3️⃣ تعديل الطلب`;

      const chatId = habit.customer.telegramId?.toString();
      if (chatId) {
        await this.messagingService.sendReply(chatId, message, cafeId);
        await this.prisma.customerHabit.update({
          where: { customerId },
          data: { lastProactiveSentAt: new Date() },
        });

        const phone = `tg_${chatId}`;
        this.pendingOffers.set(this.offerKey(cafeId, phone), {
          phone,
          cafeId,
          customerId,
          customerName,
          favoriteProduct: productName,
          sentAt: new Date(),
        });

        this.logger.log(`Proactive AI Waiter sent to ${customerName} (${phone})`);
        return true;
      }

      return false;
    } catch (err) {
      this.logger.error(`trySendProactive failed for ${customerId}: ${(err as Error).message}`);
      return false;
    }
  }

  getPendingOffer(phone: string, cafeId?: string): PendingAiWaiterOffer | undefined {
    if (!cafeId) return undefined;
    const key = this.offerKey(cafeId, phone);
    const offer = this.pendingOffers.get(key);
    if (!offer) return undefined;
    if (Date.now() - offer.sentAt.getTime() > this.OFFER_TTL_MS) {
      this.pendingOffers.delete(key);
      return undefined;
    }
    return offer;
  }

  removePendingOffer(phone: string, cafeId?: string): void {
    if (cafeId) this.pendingOffers.delete(this.offerKey(cafeId, phone));
  }

  cleanupExpiredOffers(): void {
    const now = Date.now();
    for (const [phone, offer] of this.pendingOffers) {
      if (now - offer.sentAt.getTime() > this.OFFER_TTL_MS) {
        this.pendingOffers.delete(phone);
      }
    }
  }

  private offerKey(cafeId: string, phone: string): string {
    return `${cafeId}:${phone}`;
  }
}
