export type OutboxMessageStatus = 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED' | 'DEAD_LETTER';

export interface OutboxMessage {
  messageId: string;
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
  status: OutboxMessageStatus;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_TRANSITIONS: Record<OutboxMessageStatus, OutboxMessageStatus[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['PUBLISHED', 'FAILED', 'DEAD_LETTER'],
  PUBLISHED: [],
  FAILED: ['PENDING', 'DEAD_LETTER'],
  DEAD_LETTER: [],
};

export function canTransition(from: OutboxMessageStatus, to: OutboxMessageStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OutboxMessageStatus, to: OutboxMessageStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid outbox message transition: ${from} → ${to}`,
    );
  }
}
