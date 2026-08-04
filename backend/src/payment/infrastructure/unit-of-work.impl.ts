import { UnitOfWork, PendingSave } from '../application/unit-of-work';
import { OutboxMessage } from '../application/outbox-message';
import { OutboxStore } from '../application/outbox.repository';

export class UnitOfWorkImpl implements UnitOfWork {
  private active = false;
  private pendingSaves: Map<string, PendingSave> = new Map();
  private pendingMessages: OutboxMessage[] = [];
  private outboxStore?: OutboxStore;

  constructor(outboxStore?: OutboxStore) {
    this.outboxStore = outboxStore;
  }

  begin(): void {
    if (this.active) {
      this.rollback();
    }
    this.active = true;
    this.pendingSaves.clear();
    this.pendingMessages = [];
  }

  registerSave(repositoryKey: string, aggregateId: string, execute: () => Promise<void>): void {
    if (!this.active) {
      throw new Error('Cannot register save: no active UnitOfWork. Call begin() first.');
    }
    const key = `${repositoryKey}:${aggregateId}`;
    this.pendingSaves.set(key, { repositoryKey, aggregateId, execute });
  }

  registerMessage(message: OutboxMessage): void {
    if (!this.active) {
      throw new Error('Cannot register message: no active UnitOfWork. Call begin() first.');
    }
    if (!this.outboxStore) {
      throw new Error('OutboxStore not configured. Provide OutboxStore to UnitOfWorkImpl constructor.');
    }
    this.pendingMessages.push(message);
  }

  async commit(): Promise<void> {
    if (!this.active) {
      throw new Error('No active UnitOfWork to commit. Call begin() first.');
    }
    const operations = Array.from(this.pendingSaves.values());
    const messages = [...this.pendingMessages];
    this.pendingSaves.clear();
    this.pendingMessages = [];
    this.active = false;

    for (const op of operations) {
      await op.execute();
    }

    if (this.outboxStore) {
      for (const msg of messages) {
        await this.outboxStore.save(msg);
      }
    }
  }

  async rollback(): Promise<void> {
    this.active = false;
    this.pendingSaves.clear();
    this.pendingMessages = [];
  }

  isActive(): boolean {
    return this.active;
  }
}
