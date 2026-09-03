import { ConsolidatedLedgerService } from '../application/consolidated-ledger.service';

describe('ConsolidatedLedgerService', () => {
  let service: ConsolidatedLedgerService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      enterpriseGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group_01',
          name: 'Sonex Enterprise Group',
          branches: [{ branchId: 'branch_1' }, { branchId: 'branch_2' }],
        }),
      },
      unifiedOrder: {
        findMany: jest.fn().mockResolvedValue([
          { grandTotal: 500 },
          { grandTotal: 500 },
        ]),
      },
    };

    service = new ConsolidatedLedgerService(mockPrisma as any);
  });

  it('should calculate consolidated PnL and verify zero inter-branch elimination effect', async () => {
    const res = await service.getConsolidatedPnL('group_01');

    expect(res.isSuccess).toBe(true);
    expect(res.value.groupId).toBe('group_01');
    expect(res.value.totalBranches).toBe(2);
    expect(res.value.consolidatedMetrics.totalRevenue).toBe(2000);
    expect(res.value.consolidatedMetrics.eliminatedInterBranchTransactions).toBe(0);
  });

  it('should record inter-branch transfer and enforce double-entry elimination invariants', async () => {
    const transferReq = {
      groupId: 'group_01',
      originBranchId: 'branch_1',
      destBranchId: 'branch_2',
      amount: 1000,
      itemDescription: '50kg Coffee Beans',
    };

    const res = await service.recordInterBranchTransfer(transferReq);

    expect(res.isSuccess).toBe(true);
    expect(res.value.status).toBe('BALANCED_COMMITTED');
    expect(res.value.netEliminationEffect).toBe(0.0);
  });
});
