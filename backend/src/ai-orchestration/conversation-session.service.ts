import { Injectable } from '@nestjs/common';
import { ConversationIdentity, ConversationSession } from './conversation.types';

@Injectable()
export class ConversationSessionService {
  private readonly sessions = new Map<string, ConversationSession>();
  getOrCreate(identity: ConversationIdentity): ConversationSession {
    const key = this.key(identity); const existing = this.sessions.get(key); if (existing) return existing;
    const session: ConversationSession = { identity, state: 'NEW_SESSION', draft: {}, clarificationAttempts: 0, updatedAt: new Date() };
    this.sessions.set(key, session); return session;
  }
  save(session: ConversationSession): void { session.updatedAt = new Date(); this.sessions.set(this.key(session.identity), session); }
  clear(identity: ConversationIdentity): void { this.sessions.delete(this.key(identity)); }
  private key(identity: ConversationIdentity): string { return [identity.cafeId, identity.channel, identity.botIdentity, identity.customerIdentity].join(':'); }
}
