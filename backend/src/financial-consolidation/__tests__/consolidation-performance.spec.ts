import { ConsolidatedLedgerService } from '../application/consolidated-ledger.service';

describe('Performance & Stress Suite - RFC-025 Consolidation Engine', () => {
  let service: ConsolidatedLedgerService;
  let mockPrisma: any;

  beforeEach(() => {
    // Simulate 50 enterprise branches with 1,000 transactions each
    const mockBranches = Array.from({ length: 50 }, (_, i) => ({
      branchId: `branch_${i + 1}`,
    }));

    mockPrisma = {
      enterpriseGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group_stress_100',
          name: 'Sonex High Velocity Group',
          branches: mockBranches,
        }),
      },
      unifiedOrder: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 20 }, (_, i) => ({ grandTotal: 250 })),
        ),
      },
    };

    service = new ConsolidatedLedgerService(mockPrisma as any);
  });

  it('should compute consolidated PnL across 50 branches within sub-second SLA (< 300ms)', async () => {
    const startTime = Date.now();

    const res = await service.getConsolidatedPnL('group_stress_100');

    const durationMs = Date.now() - startTime;

    expect(res.isSuccess).toBe(true);
    expect(res.value.totalBranches).toBe(50);
    expect(res.value.consolidatedMetrics.totalRevenue).toBe(250000); // 50 branches * 20 orders * $250
    expect(durationMs).toBeLessThan(300); // SLA < 300ms
  });

  it('should process 100 concurrent inter-branch transfers without lock contention', async () => {
    const startTime = Date.now();

    const transferPromises = Array.from({ length: 100 }, (_, i) =>
      service.recordInterBranchTransfer({
        groupId: 'group_stress_100',
        originBranchId: `branch_${(i % 50) + 1}`,
        destBranchId: `branch_${((i + 1) % 50) + 1}`,
        amount: 500,
        itemDescription: `Concurrent Item Batch ${i}`,
      }),
    );

    const results = await Promise.all(transferPromises);
    const durationMs = Date.now() - startTime;

    expect(results.every((r) => r.isSuccess)).toBe(true);
    expect(results.every((r) => r.value.netEliminationEffect === 0.0)).toBe(true);
    expect(durationMs).toBeLessThan(500); // 100 concurrent transfers processed under 500ms
  });
});
