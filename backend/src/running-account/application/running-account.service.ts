import { Inject, Injectable } from '@nestjs/common';
import { IRunningAccountRepository } from '../domain/repositories/running-account.repository.interface';
import { RunningAccount } from '../domain/running-account.aggregate';
import { Result } from '../../common/result';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RunningAccountService {
  constructor(
    @Inject('IRunningAccountRepository')
    private readonly repo: IRunningAccountRepository,
  ) {}

  async getOrCreateAccount(
    customerId: string,
    branchId: string,
    creditLimit = 1000,
    maxPaymentDays = 30,
  ): Promise<Result<RunningAccount>> {
    try {
      let account = await this.repo.findByCustomerId(customerId);
      if (!account) {
        account = new RunningAccount({
          id: uuidv4(),
          customerId,
          branchId,
          creditLimit,
          currentBalance: 0,
          maxPaymentDays,
          isBlocked: false,
        });
        account = await this.repo.save(account);
      }
      return Result.ok(account);
    } catch (err: any) {
      return Result.fail(`Failed to retrieve running account: ${err.message}`);
    }
  }

  async validateOrderCredit(
    customerId: string,
    branchId: string,
    orderTotal: number,
  ): Promise<Result<boolean>> {
    try {
      const accRes = await this.getOrCreateAccount(customerId, branchId);
      if (!accRes.isSuccess) {
        return Result.fail(accRes.error);
      }

      const account = accRes.value;
      const check = account.canAccrueCredit(orderTotal);
      if (!check.allowed) {
        return Result.fail(check.reason!);
      }

      return Result.ok(true);
    } catch (err: any) {
      return Result.fail(`Credit validation failed: ${err.message}`);
    }
  }

  async recordCreditCharge(
    customerId: string,
    branchId: string,
    amount: number,
  ): Promise<Result<RunningAccount>> {
    try {
      const accRes = await this.getOrCreateAccount(customerId, branchId);
      if (!accRes.isSuccess) {
        return Result.fail(accRes.error);
      }

      const account = accRes.value;
      account.chargeCredit(amount);
      const saved = await this.repo.save(account);

      return Result.ok(saved);
    } catch (err: any) {
      return Result.fail(`Failed to record credit charge: ${err.message}`);
    }
  }

  async recordPayment(
    customerId: string,
    branchId: string,
    amount: number,
  ): Promise<Result<RunningAccount>> {
    try {
      const accRes = await this.getOrCreateAccount(customerId, branchId);
      if (!accRes.isSuccess) {
        return Result.fail(accRes.error);
      }

      const account = accRes.value;
      account.recordPayment(amount);
      const saved = await this.repo.save(account);

      return Result.ok(saved);
    } catch (err: any) {
      return Result.fail(`Failed to record payment: ${err.message}`);
    }
  }
}
