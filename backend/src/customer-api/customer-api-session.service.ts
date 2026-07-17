import { Injectable } from '@nestjs/common';
import { CustomerSession } from './customer-api.types';

@Injectable()
export class CustomerApiSessionService {
  private readonly sessions = new Map<string, CustomerSession>();

  find(customerId: string): CustomerSession | undefined {
    return this.sessions.get(customerId);
  }

  create(customerId: string, cafeId: string, phone: string): CustomerSession {
    const session: CustomerSession = {
      customerId,
      cafeId,
      phone,
      currentStep: 'NEW',
      collectedInformation: {},
      missingInformation: [],
    };
    this.sessions.set(customerId, session);
    return session;
  }

  getOrCreate(customerId: string, cafeId: string, phone: string): CustomerSession {
    const existing = this.find(customerId);
    if (existing) return existing;
    return this.create(customerId, cafeId, phone);
  }

  update(session: CustomerSession): void {
    this.sessions.set(session.customerId, session);
  }

  delete(customerId: string): void {
    this.sessions.delete(customerId);
  }

  clearAll(): void {
    this.sessions.clear();
  }
}
