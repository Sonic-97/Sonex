import { MorningBriefService } from '../application/morning-brief.service';

describe('MorningBriefService', () => {
  let service: MorningBriefService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      unifiedOrder: {
        findMany: jest.fn().mockResolvedValue([
          { grandTotal: 100 },
          { grandTotal: 200 },
        ]),
      },
      runningAccount: {
        findMany: jest.fn().mockResolvedValue([
          { currentBalance: 500 },
        ]),
      },
      inventory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv_1', itemName: 'Coffee Beans', currentQty: 2, minThreshold: 5 },
        ]),
        fields: {
          minThreshold: 'minThreshold',
        },
      },
    };

    service = new MorningBriefService(mockPrisma as any);
  });

  it('should generate structured Executive Morning Brief with Health Score and AI Recommendations', async () => {
    const res = await service.generateMorningBrief('cafe_01', 'branch_01');

    expect(res.isSuccess).toBe(true);
    expect(res.value.totalRevenue).toBe(300);
    expect(res.value.netProfit).toBeGreaterThan(0);
    expect(res.value.healthScore).toBeGreaterThan(0);
    expect(res.value.recommendations.length).toBeGreaterThan(0);
    expect(res.value.recommendations[0].title).toBeDefined();
    expect(res.value.recommendations[0].evidence).toBeDefined();
  });

  it('should approve AI recommendation with 1-click action execution', async () => {
    const res = await service.approveRecommendation('rec_100', 'owner_01');

    expect(res.isSuccess).toBe(true);
    expect(res.value.status).toBe('EXECUTED');
  });
});
