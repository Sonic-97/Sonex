import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IRunningAccountRepository } from '../../domain/repositories/running-account.repository.interface';
import { RunningAccount } from '../../domain/running-account.aggregate';

@Injectable()
export class PrismaRunningAccountRepository implements IRunningAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCustomerId(customerId: string): Promise<RunningAccount | null> {
    const raw = await this.prisma.runningAccount.findUnique({
      where: { customerId },
    });

    if (!raw) return null;

    return new RunningAccount({
      id: raw.id,
      customerId: raw.customerId,
      branchId: raw.branchId,
      creditLimit: Number(raw.creditLimit),
      currentBalance: Number(raw.currentBalance),
      maxPaymentDays: raw.maxPaymentDays,
      isBlocked: raw.isBlocked,
      lastPaymentAt: raw.lastPaymentAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async save(account: RunningAccount): Promise<RunningAccount> {
    const raw = await this.prisma.runningAccount.upsert({
      where: { customerId: account.customerId },
      create: {
        id: account.id,
        customerId: account.customerId,
        branchId: account.branchId,
        creditLimit: account.creditLimit,
        currentBalance: account.currentBalance,
        maxPaymentDays: account.maxPaymentDays,
        isBlocked: account.isBlocked,
        lastPaymentAt: account.lastPaymentAt,
      },
      update: {
        creditLimit: account.creditLimit,
        currentBalance: account.currentBalance,
        maxPaymentDays: account.maxPaymentDays,
        isBlocked: account.isBlocked,
        lastPaymentAt: account.lastPaymentAt,
      },
    });

    return new RunningAccount({
      id: raw.id,
      customerId: raw.customerId,
      branchId: raw.branchId,
      creditLimit: Number(raw.creditLimit),
      currentBalance: Number(raw.currentBalance),
      maxPaymentDays: raw.maxPaymentDays,
      isBlocked: raw.isBlocked,
      lastPaymentAt: raw.lastPaymentAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
