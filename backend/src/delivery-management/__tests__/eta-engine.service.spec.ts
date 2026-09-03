import { ETAEngineService } from '../application/services/eta-engine.service';
import { DeliveryZone } from '../domain/aggregates/delivery-zone.aggregate';

describe('ETAEngineService', () => {
  let service: ETAEngineService;

  const zone = new DeliveryZone({
    id: 'zone_01',
    branchId: 'branch_01',
    name: 'Zone A',
    mainStreet: 'Main St',
    deliveryFee: 15,
    minimumOrder: 50,
    etaMinutes: 30,
    isActive: true,
  });

  beforeEach(() => {
    service = new ETAEngineService();
  });

  it('should return base ETA when demand and drivers are normal', () => {
    const result = service.calculateETA(zone, 2, 3);
    expect(result.baseEtaMinutes).toBe(30);
    expect(result.bufferMinutes).toBe(0);
    expect(result.estimatedEtaMinutes).toBe(30);
  });

  it('should adjust buffer for high order volume and zero drivers', () => {
    const result = service.calculateETA(zone, 18, 0);
    expect(result.bufferMinutes).toBeGreaterThan(20);
    expect(result.estimatedEtaMinutes).toBeGreaterThan(50);
  });
});
