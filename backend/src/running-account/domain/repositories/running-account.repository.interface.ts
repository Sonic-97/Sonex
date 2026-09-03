import { RunningAccount } from '../running-account.aggregate';

export interface IRunningAccountRepository {
  findByCustomerId(customerId: string): Promise<RunningAccount | null>;
  save(account: RunningAccount): Promise<RunningAccount>;
}
