import { RunningAccountService } from '../application/running-account.service';
import { IRunningAccountRepository } from '../domain/repositories/running-account.repository.interface';
import { RunningAccount } from '../domain/running-account.aggregate';

describe('RunningAccountService', () => {
  let service: RunningAccountService;
  let mockRepo: jest.Mocked<IRunningAccountRepository>;

  const sampleAccount = new RunningAccount({
    id: 'acc_100',
    customerId: 'cust_01',
    branchId: 'branch_01',
    creditLimit: 500,
    currentBalance: 100,
    maxPaymentDays: 30,
    isBlocked: false,
  });

  beforeEach(() => {
    mockRepo = {
      findByCustomerId: jest.fn().mockResolvedValue(sampleAccount),
      save: jest.fn().mockImplementation((acc) => Promise.resolve(acc)),
    };

    service = new RunningAccountService(mockRepo);
  });

  it('should validate credit when order total is within credit limit', async () => {
    const res = await service.validateOrderCredit('cust_01', 'branch_01', 200);
    expect(res.isSuccess).toBe(true);
    expect(res.value).toBe(true);
  });

  it('should reject order credit when total exceeds credit limit', async () => {
    const res = await service.validateOrderCredit('cust_01', 'branch_01', 450); // 100 + 450 = 550 > 500
    expect(res.isSuccess).toBe(false);
    expect(res.error).toContain('exceed customer credit limit');
  });

  it('should reject credit charge if account is blocked', async () => {
    const blockedAccount = new RunningAccount({
      ...sampleAccount.toJSON(),
      isBlocked: true,
    });
    mockRepo.findByCustomerId.mockResolvedValue(blockedAccount);

    const res = await service.recordCreditCharge('cust_01', 'branch_01', 50);
    expect(res.isSuccess).toBe(false);
    expect(res.error).toContain('blocked by administration');
  });

  it('should record payment and update balance', async () => {
    const res = await service.recordPayment('cust_01', 'branch_01', 50);
    expect(res.isSuccess).toBe(true);
    expect(res.value.currentBalance).toBe(50);
  });
});
