export type InboxMessageStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';

export interface InboxMessage {
  messageId: string;
  consumerId: string;
  aggregateId: string;
  aggregateType: string;
  tenantId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  payload: string;
  headers: Record<string, string>;
  correlationId: string;
  causationId: string;
  status: InboxMessageStatus;
  retryCount: number;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_TRANSITIONS: Record<InboxMessageStatus, InboxMessageStatus[]> = {
  RECEIVED: ['PROCESSING'],
  PROCESSING: ['PROCESSED', 'FAILED', 'DEAD_LETTER'],
  PROCESSED: [],
  FAILED: ['PROCESSING', 'DEAD_LETTER'],
  DEAD_LETTER: [],
};

export function inboxCanTransition(from: InboxMessageStatus, to: InboxMessageStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface InboxStore {
  save(message: InboxMessage): Promise<void>;
  findById(messageId: string, consumerId: string): Promise<InboxMessage | null>;
  updateStatus(messageId: string, consumerId: string, status: InboxMessageStatus, retryCount?: number): Promise<void>;
  countByStatus(status: InboxMessageStatus): Promise<number>;
  findPending(consumerId: string, limit?: number): Promise<InboxMessage[]>;
}
