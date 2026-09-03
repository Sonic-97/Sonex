import { InterBranchTransferService } from '../application/inter-branch-transfer.service';

describe('InterBranchTransferService', () => {
  let service: InterBranchTransferService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {};
    service = new InterBranchTransferService(mockPrisma as any);
  });

  it('should execute balanced inter-branch transfer and enforce double-entry law', async () => {
    const dto = {
      groupId: 'group_01',
      originBranchId: 'branch_a',
      destBranchId: 'branch_b',
      amount: 1500,
      itemDescription: '100kg Espresso Coffee Beans',
    };

    const res = await service.executeInterBranchTransfer(dto);

    expect(res.isSuccess).toBe(true);
    expect(res.value.status).toBe('BALANCED_COMMITTED');
    expect(res.value.originJournalEntry.amount).toBe(1500);
    expect(res.value.destJournalEntry.amount).toBe(1500);
    expect(res.value.eliminationEntry.netEffect).toBe(0.0);
  });

  it('should reject transfers with negative or zero amounts', async () => {
    const dto = {
      groupId: 'group_01',
      originBranchId: 'branch_a',
      destBranchId: 'branch_b',
      amount: 0,
      itemDescription: 'Invalid Transfer',
    };

    const res = await service.executeInterBranchTransfer(dto);

    expect(res.isSuccess).toBe(false);
    expect(res.error).toContain('greater than zero');
  });

  it('should reject transfers where origin and destination branches are identical', async () => {
    const dto = {
      groupId: 'group_01',
      originBranchId: 'branch_a',
      destBranchId: 'branch_a',
      amount: 500,
      itemDescription: 'Same Branch Transfer',
    };

    const res = await service.executeInterBranchTransfer(dto);

    expect(res.isSuccess).toBe(false);
    expect(res.error).toContain('must be different');
  });
});
