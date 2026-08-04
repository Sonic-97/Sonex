import { OutboxMessage, OutboxMessageStatus } from './outbox-message';

export interface OutboxStore {
  save(message: OutboxMessage): Promise<void>;
  findPending(limit?: number): Promise<OutboxMessage[]>;
  findById(messageId: string): Promise<OutboxMessage | null>;
  updateStatus(messageId: string, status: OutboxMessageStatus, retryCount?: number): Promise<void>;
  countByStatus(status: OutboxMessageStatus): Promise<number>;
}

export interface OutboxPublisher {
  publish(message: OutboxMessage): Promise<boolean>;
}
