import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationPreferences {
  orderStatus: boolean;
  loyaltyProgress: boolean;
  rewardExpiry: boolean;
  personalOffers: boolean;
  productAvailability: boolean;
  reengagement: boolean;
  postOrderFeedback: boolean;
  quietHourStart: number;
  quietHourEnd: number;
}

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(cafeId: string, customerId: string): Promise<NotificationPreferences> {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { customerId },
    });

    return {
      orderStatus: prefs?.orderStatus ?? true,
      loyaltyProgress: prefs?.loyaltyProgress ?? true,
      rewardExpiry: prefs?.rewardExpiry ?? true,
      personalOffers: prefs?.personalOffers ?? true,
      productAvailability: prefs?.productAvailability ?? true,
      reengagement: prefs?.reengagement ?? true,
      postOrderFeedback: prefs?.postOrderFeedback ?? true,
      quietHourStart: prefs?.quietHourStart ?? 22,
      quietHourEnd: prefs?.quietHourEnd ?? 8,
    };
  }

  async updatePreference(cafeId: string, customerId: string, key: string, value: boolean | number): Promise<NotificationPreferences> {
    const validKeys = ['orderStatus', 'loyaltyProgress', 'rewardExpiry', 'personalOffers',
      'productAvailability', 'reengagement', 'postOrderFeedback', 'quietHourStart', 'quietHourEnd'];

    if (!validKeys.includes(key)) {
      throw new Error(`Invalid preference key: ${key}`);
    }

    await this.prisma.notificationPreference.upsert({
      where: { customerId },
      create: {
        cafeId,
        customerId,
        [key]: value,
      },
      update: {
        [key]: value,
      },
    });

    return this.getPreferences(cafeId, customerId);
  }

  async updateQuietHours(cafeId: string, customerId: string, start: number, end: number): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: { customerId },
      create: { cafeId, customerId, quietHourStart: start, quietHourEnd: end },
      update: { quietHourStart: start, quietHourEnd: end },
    });
  }

  async isQuietHour(cafeId: string, customerId: string): Promise<boolean> {
    const prefs = await this.getPreferences(cafeId, customerId);
    const now = new Date();
    const hour = now.getHours();

    if (prefs.quietHourStart <= prefs.quietHourEnd) {
      return hour >= prefs.quietHourStart && hour < prefs.quietHourEnd;
    }
    return hour >= prefs.quietHourStart || hour < prefs.quietHourEnd;
  }

  async canSendMessage(cafeId: string, customerId: string, messageType: string): Promise<boolean> {
    const prefs = await this.getPreferences(cafeId, customerId);

    const prefMap: Record<string, keyof NotificationPreferences> = {
      'order_status': 'orderStatus',
      'loyalty_progress': 'loyaltyProgress',
      'reward_expiry': 'rewardExpiry',
      'personal_offer': 'personalOffers',
      'product_availability': 'productAvailability',
      'reengagement': 'reengagement',
      'post_order_feedback': 'postOrderFeedback',
    };

    const prefKey = prefMap[messageType];
    if (prefKey && !(prefs as any)[prefKey]) return false;

    if (messageType !== 'order_status' && messageType !== 'reward_expiry') {
      const qh = await this.isQuietHour(cafeId, customerId);
      if (qh) return false;
    }

    return true;
  }

  async handleOptOutCommand(cafeId: string, customerId: string, message: string): Promise<string | null> {
    const optOutPatterns: Array<{ regex: RegExp; key: string; value: boolean }> = [
      { regex: /مترسلش عروض|متبعتليش عروض|لا عروض/i, key: 'personalOffers', value: false },
      { regex: /مترسلش حاجه|متبعتليش حاجه|stop all/i, key: 'personalOffers', value: false },
      { regex: /متبعتليش رسايل بعد الطلب|مترسلش بعد الطلب/i, key: 'postOrderFeedback', value: false },
      { regex: /حالة الطلب بس/i, key: 'personalOffers', value: false },
    ];

    for (const pattern of optOutPatterns) {
      if (pattern.regex.test(message)) {
        await this.updatePreference(cafeId, customerId, pattern.key, pattern.value);
        return `تم تحديث الإعدادات ✅`;
      }
    }

    return null;
  }
}
