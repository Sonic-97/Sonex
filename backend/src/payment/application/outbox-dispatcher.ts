import { OutboxMessage } from './outbox-message';
import { OutboxStore, OutboxPublisher } from './outbox.repository';

export interface DispatcherOptions {
  batchSize: number;
  maxRetries: number;
}

const DEFAULT_OPTIONS: DispatcherOptions = {
  batchSize: 10,
  maxRetries: 3,
};

export class OutboxDispatcher {
  private readonly store: OutboxStore;
  private readonly publisher: OutboxPublisher;
  private readonly options: DispatcherOptions;

  constructor(store: OutboxStore, publisher: OutboxPublisher, options?: Partial<DispatcherOptions>) {
    this.store = store;
    this.publisher = publisher;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async dispatch(): Promise<number> {
    const messages = await this.store.findPending(this.options.batchSize);
    let dispatched = 0;
    for (const message of messages) {
      await this.processMessage(message);
      dispatched++;
    }
    return dispatched;
  }

  private async processMessage(message: OutboxMessage): Promise<void> {
    await this.store.updateStatus(message.messageId, 'PROCESSING');

    try {
      const success = await this.publisher.publish(message);
      if (success) {
        await this.store.updateStatus(message.messageId, 'PUBLISHED');
      } else {
        await this.handleFailure(message);
      }
    } catch {
      await this.handleFailure(message);
    }
  }

  private async handleFailure(message: OutboxMessage): Promise<void> {
    const newRetryCount = message.retryCount + 1;
    if (newRetryCount >= this.options.maxRetries) {
      await this.store.updateStatus(message.messageId, 'DEAD_LETTER', newRetryCount);
    } else {
      await this.store.updateStatus(message.messageId, 'FAILED', newRetryCount);
    }
  }
}
