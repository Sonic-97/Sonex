import { DeliveryAIAnalyticsService } from '../application/services/delivery-ai-analytics.service';
import { DeliveryZoneManagementService } from '../application/services/delivery-zone-management.service';
import { DeliveryZone } from '../domain/aggregates/delivery-zone.aggregate';

describe('DeliveryAIAnalyticsService', () => {
  let service: DeliveryAIAnalyticsService;
  let mockManagement: jest.Mocked<DeliveryZoneManagementService>;

  const zone = new DeliveryZone({
    id: 'zone_01',
    branchId: 'branch_01',
    name: 'Nasr City',
    mainStreet: 'Abbas El Akkad',
    deliveryFee: 15,
    minimumOrder: 50,
    etaMinutes: 45,
    isActive: true,
  });

  beforeEach(() => {
    mockManagement = {
      getZonesByBranch: jest.fn().mockResolvedValue([zone]),
    } as any;

    service = new DeliveryAIAnalyticsService(mockManagement);
  });

  it('should generate zone metrics and AI recommendations', async () => {
    const analytics = await service.analyzeBranchZones('branch_01');

    expect(analytics.branchId).toBe('branch_01');
    expect(analytics.zoneMetrics.length).toBe(1);
    expect(analytics.aiRecommendations.length).toBeGreaterThan(0);
    expect(analytics.aiRecommendations[0].title).toBeDefined();
    expect(analytics.aiRecommendations[0].explanation).toBeDefined();
  });
});
