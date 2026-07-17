import { Injectable, Logger } from '@nestjs/common';
import { CustomerSession } from './telegram-adapter.types';

const SESSION_PREFIX = 'session:telegram:';
const inMemorySessions = new Map<string, CustomerSession>();

@Injectable()
export class TelegramSessionService {
  private readonly logger = new Logger(TelegramSessionService.name);

  get(cafeId: string, telegramUserId: string): CustomerSession | undefined {
    return inMemorySessions.get(`${SESSION_PREFIX}${cafeId}:${telegramUserId}`);
  }

  set(session: CustomerSession): void {
    const key = `${SESSION_PREFIX}${session.cafeId}:${session.telegramUserId}`;
    inMemorySessions.set(key, session);
  }

  clear(cafeId: string, telegramUserId: string): void {
    inMemorySessions.delete(`${SESSION_PREFIX}${cafeId}:${telegramUserId}`);
  }

  async findOrCreate(
    cafeId: string,
    telegramUserId: string,
    telegramPhone?: string,
  ): Promise<CustomerSession> {
    const existing = this.get(cafeId, telegramUserId);
    if (existing) return existing;

    const phone = telegramPhone || `tg_${telegramUserId}`;
    const session: CustomerSession = {
      customerId: `tg-${telegramUserId}-${cafeId}`,
      cafeId,
      telegramUserId,
      branchId: 'default',
    };

    this.set(session);
    return session;
  }
}
