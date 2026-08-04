import { InboxMessage, InboxStore } from './inbox';
import { OutboxMessage } from './outbox-message';

export interface EventConsumer {
  readonly consumerId: string;
  canHandle(eventType: string): boolean;
  handle(message: OutboxMessage): Promise<boolean>;
}

export interface InboxProcessorOptions {
  maxRetries: number;
}

const DEFAULT_OPTIONS: InboxProcessorOptions = {
  maxRetries: 3,
};

export class InboxProcessor {
  private readonly store: InboxStore;
  private readonly consumers: EventConsumer[];
  private readonly options: InboxProcessorOptions;
  private running = false;

  constructor(store: InboxStore, consumers: EventConsumer[], options?: Partial<InboxProcessorOptions>) {
    this.store = store;
    this.consumers = consumers;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async process(message: OutboxMessage): Promise<void> {
    for (const consumer of this.consumers) {
      if (!consumer.canHandle(message.eventType)) continue;

      const existing = await this.store.findById(message.messageId, consumer.consumerId);
      if (existing && existing.status === 'PROCESSED') {
        continue;
      }

      const retryCount = existing?.retryCount ?? 0;
    const inboxMsg: InboxMessage = {
        messageId: message.messageId,
        consumerId: consumer.consumerId,
        aggregateId: message.aggregateId,
        aggregateType: message.aggregateType,
        tenantId: message.tenantId,
        eventType: message.eventType,
        eventVersion: message.eventVersion,
        occurredAt: message.occurredAt,
        payload: message.payload,
        headers: { ...message.headers },
        correlationId: message.correlationId,
        causationId: message.causationId,
        status: 'RECEIVED',
        retryCount,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.store.save(inboxMsg);
      await this.store.updateStatus(inboxMsg.messageId, consumer.consumerId, 'PROCESSING');

      try {
        const success = await consumer.handle(message);
        if (success) {
          await this.store.updateStatus(inboxMsg.messageId, consumer.consumerId, 'PROCESSED');
        } else {
          await this.handleFailure(inboxMsg, consumer);
        }
      } catch {
        await this.handleFailure(inboxMsg, consumer);
      }
    }
  }

  private async handleFailure(inboxMsg: InboxMessage, consumer: EventConsumer): Promise<void> {
    const newRetryCount = inboxMsg.retryCount + 1;
    if (newRetryCount >= this.options.maxRetries) {
      await this.store.updateStatus(inboxMsg.messageId, consumer.consumerId, 'DEAD_LETTER', newRetryCount);
    } else {
      await this.store.updateStatus(inboxMsg.messageId, consumer.consumerId, 'FAILED', newRetryCount);
    }
  }
}
