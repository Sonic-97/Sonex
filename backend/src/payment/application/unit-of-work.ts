import { OutboxMessage } from './outbox-message';

export interface PendingSave {
  repositoryKey: string;
  aggregateId: string;
  execute: () => Promise<void>;
}

export interface UnitOfWork {
  begin(): void;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
  registerSave(repositoryKey: string, aggregateId: string, execute: () => Promise<void>): void;
  registerMessage(message: OutboxMessage): void;
}
