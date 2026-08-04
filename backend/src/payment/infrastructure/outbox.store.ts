import { OutboxMessage, OutboxMessageStatus } from '../application/outbox-message';
import { OutboxStore } from '../application/outbox.repository';

export class InMemoryOutboxStore implements OutboxStore {
  private messages = new Map<string, OutboxMessage>();

  async save(message: OutboxMessage): Promise<void> {
    const existing = this.messages.get(message.messageId);
    if (existing && existing.status === 'PUBLISHED') {
      return;
    }
    this.messages.set(message.messageId, {
      ...message,
      createdAt: existing?.createdAt ?? message.createdAt,
      updatedAt: new Date(),
    });
  }

  async findPending(limit = 10): Promise<OutboxMessage[]> {
    const pending: OutboxMessage[] = [];
    for (const msg of this.messages.values()) {
      if (msg.status === 'PENDING' || msg.status === 'FAILED') {
        pending.push({ ...msg });
      }
    }
    pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return pending.slice(0, limit);
  }

  async findById(messageId: string): Promise<OutboxMessage | null> {
    const msg = this.messages.get(messageId);
    return msg ? { ...msg } : null;
  }

  async updateStatus(messageId: string, status: OutboxMessageStatus, retryCount?: number): Promise<void> {
    const existing = this.messages.get(messageId);
    if (!existing) {
      throw new Error(`Outbox message not found: ${messageId}`);
    }
    this.messages.set(messageId, {
      ...existing,
      status,
      retryCount: retryCount ?? existing.retryCount,
      updatedAt: new Date(),
    });
  }

  async countByStatus(status: OutboxMessageStatus): Promise<number> {
    let count = 0;
    for (const msg of this.messages.values()) {
      if (msg.status === status) count++;
    }
    return count;
  }

  clear(): void {
    this.messages.clear();
  }
}
