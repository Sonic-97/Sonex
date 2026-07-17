import { Injectable } from '@nestjs/common';
import { SessionContext, ChannelType } from '../interfaces/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SessionResolver {
  private sessions = new Map<string, SessionContext>();

  findOrCreate(params: {
    channelType: ChannelType;
    externalUserId: string;
    cafeId: string;
    customerId?: string;
    branchId?: string;
  }): SessionContext {
    const sessionId = `${params.channelType}-${params.externalUserId}-${params.cafeId}`;
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.updatedAt = new Date();
      if (params.customerId && !existing.customerId) {
        existing.customerId = params.customerId;
      }
      return existing;
    }

    const session: SessionContext = {
      sessionId,
      channelType: params.channelType,
      externalUserId: params.externalUserId,
      cafeId: params.cafeId,
      customerId: params.customerId,
      branchId: params.branchId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  update(sessionId: string, updates: Partial<SessionContext>): SessionContext | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;
    Object.assign(existing, updates, { updatedAt: new Date() });
    return existing;
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  getAll(): SessionContext[] {
    return Array.from(this.sessions.values());
  }

  findByCustomer(cafeId: string, customerId: string): SessionContext[] {
    return this.getAll().filter(
      s => s.cafeId === cafeId && s.customerId === customerId,
    );
  }

  findByCafe(cafeId: string): SessionContext[] {
    return this.getAll().filter(s => s.cafeId === cafeId);
  }
}
