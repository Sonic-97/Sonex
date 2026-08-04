import { InboxMessage, InboxMessageStatus, InboxStore } from '../application/inbox';

export class InMemoryInboxStore implements InboxStore {
  private messages = new Map<string, InboxMessage>();

  private key(messageId: string, consumerId: string): string {
    return `${consumerId}:${messageId}`;
  }

  async save(message: InboxMessage): Promise<void> {
    const k = this.key(message.messageId, message.consumerId);
    const existing = this.messages.get(k);
    if (existing && existing.status === 'PROCESSED') {
      return;
    }
    this.messages.set(k, {
      ...message,
      createdAt: existing?.createdAt ?? message.createdAt,
      updatedAt: new Date(),
    });
  }

  async findById(messageId: string, consumerId: string): Promise<InboxMessage | null> {
    const msg = this.messages.get(this.key(messageId, consumerId));
    return msg ? { ...msg } : null;
  }

  async updateStatus(messageId: string, consumerId: string, status: InboxMessageStatus, retryCount?: number): Promise<void> {
    const k = this.key(messageId, consumerId);
    const existing = this.messages.get(k);
    if (!existing) {
      throw new Error(`Inbox message not found: ${k}`);
    }
    this.messages.set(k, {
      ...existing,
      status,
      retryCount: retryCount ?? existing.retryCount,
      processedAt: status === 'PROCESSED' ? new Date() : existing.processedAt,
      updatedAt: new Date(),
    });
  }

  async countByStatus(status: InboxMessageStatus): Promise<number> {
    let count = 0;
    for (const msg of this.messages.values()) {
      if (msg.status === status) count++;
    }
    return count;
  }

  async findPending(consumerId: string, limit = 10): Promise<InboxMessage[]> {
    const pending: InboxMessage[] = [];
    for (const msg of this.messages.values()) {
      if (msg.consumerId !== consumerId) continue;
      if (msg.status === 'RECEIVED' || msg.status === 'FAILED') {
        pending.push({ ...msg });
      }
    }
    pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return pending.slice(0, limit);
  }

  clear(): void {
    this.messages.clear();
  }
}
