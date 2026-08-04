import { OutboxStore, OutboxPublisher } from './outbox.repository';
import { InboxProcessor } from './inbox-processor';

export class OutboxRelay {
  private readonly outboxStore: OutboxStore;
  private readonly outboxPublisher: OutboxPublisher;
  private readonly inboxProcessor: InboxProcessor;
  private running = false;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    outboxStore: OutboxStore,
    outboxPublisher: OutboxPublisher,
    inboxProcessor: InboxProcessor,
  ) {
    this.outboxStore = outboxStore;
    this.outboxPublisher = outboxPublisher;
    this.inboxProcessor = inboxProcessor;
  }

  start(intervalMs = 5000): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.tick(), intervalMs);
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async tick(): Promise<void> {
    try {
      const messages = await this.outboxStore.findPending(10);
      for (const message of messages) {
        await this.outboxStore.updateStatus(message.messageId, 'PROCESSING');
        try {
          const success = await this.outboxPublisher.publish(message);
          if (success) {
            await this.outboxStore.updateStatus(message.messageId, 'PUBLISHED');
            await this.inboxProcessor.process(message);
          } else {
            await this.handleOutboxFailure(message);
          }
        } catch {
          await this.handleOutboxFailure(message);
        }
      }
    } catch {
      // Log and continue
    }
  }

  private async handleOutboxFailure(message: { messageId: string; retryCount: number }): Promise<void> {
    const newRetryCount = message.retryCount + 1;
    const maxRetries = 3;
    if (newRetryCount >= maxRetries) {
      await this.outboxStore.updateStatus(message.messageId, 'DEAD_LETTER', newRetryCount);
    } else {
      await this.outboxStore.updateStatus(message.messageId, 'FAILED', newRetryCount);
    }
  }
}
