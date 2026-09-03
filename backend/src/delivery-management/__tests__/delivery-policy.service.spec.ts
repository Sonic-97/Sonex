import { DeliveryPolicyService } from '../application/services/delivery-policy.service';
import { DeliveryZone } from '../domain/aggregates/delivery-zone.aggregate';

describe('DeliveryPolicyService', () => {
  let service: DeliveryPolicyService;

  const zone = new DeliveryZone({
    id: 'zone_01',
    branchId: 'branch_01',
    name: 'Zone A',
    mainStreet: 'Main St',
    deliveryFee: 20,
    minimumOrder: 100,
    etaMinutes: 25,
    isActive: true,
  });

  beforeEach(() => {
    service = new DeliveryPolicyService();
  });

  it('should calculate delivery fee and minimum order shortfall when below minimum', () => {
    const result = service.calculateDeliveryPolicy(zone, 60);
    expect(result.deliveryFee).toBe(20);
    expect(result.isMinimumSatisfied).toBe(false);
    expect(result.shortfall).toBe(40);
    expect(result.finalTotal).toBe(80);
  });

  it('should calculate free delivery when subtotal exceeds free delivery threshold', () => {
    const result = service.calculateDeliveryPolicy(zone, 200, 150);
    expect(result.isFreeDelivery).toBe(true);
    expect(result.deliveryFee).toBe(0);
    expect(result.finalTotal).toBe(200);
  });

  it('should throw BadRequestException when enforcing minimum order if below minimum', () => {
    expect(() => service.enforceMinimumOrder(zone, 50)).toThrow('below the minimum order amount');
  });
});
