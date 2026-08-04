import { OutboxMessage } from '../application/outbox-message';
import { OutboxPublisher } from '../application/outbox.repository';

export class InMemoryOutboxPublisher implements OutboxPublisher {
  published: OutboxMessage[] = [];
  failNext = false;

  async publish(message: OutboxMessage): Promise<boolean> {
    if (this.failNext) {
      this.failNext = false;
      return false;
    }
    this.published.push(message);
    return true;
  }

  reset(): void {
    this.published = [];
    this.failNext = false;
  }
}
