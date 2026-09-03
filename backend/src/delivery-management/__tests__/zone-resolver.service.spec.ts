import { ZoneResolverService } from '../application/services/zone-resolver.service';
import { GeoLocationService } from '../application/services/geo-location.service';
import { DeliveryZone } from '../domain/aggregates/delivery-zone.aggregate';
import { DeliveryZoneStreet } from '../domain/entities/delivery-zone-street.entity';
import { IDeliveryZoneRepository } from '../domain/repositories/delivery-zone.repository.interface';

describe('ZoneResolverService', () => {
  let service: ZoneResolverService;
  let geoLocationService: GeoLocationService;
  let mockRepo: jest.Mocked<IDeliveryZoneRepository>;

  const sampleZone = new DeliveryZone({
    id: 'zone_nasr_city',
    branchId: 'branch_01',
    name: 'Nasr City - Abbas El Akkad',
    mainStreet: 'Abbas El Akkad',
    deliveryFee: 15,
    minimumOrder: 50,
    etaMinutes: 30,
    isActive: true,
    streets: [
      new DeliveryZoneStreet('s1', 'zone_nasr_city', 'أحمد فخري', 0),
      new DeliveryZoneStreet('s2', 'zone_nasr_city', 'Makram Ebeid', 1),
    ],
  });

  beforeEach(() => {
    geoLocationService = new GeoLocationService();
    mockRepo = {
      findById: jest.fn(),
      findByBranchId: jest.fn().mockResolvedValue([sampleZone]),
      findByCafeId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      addStreet: jest.fn(),
      removeStreet: jest.fn(),
    };

    service = new ZoneResolverService(mockRepo, geoLocationService);
  });

  it('should resolve delivery zone by main street name', async () => {
    const result = await service.resolveByStreetName('branch_01', 'Abbas El Akkad');
    expect(result.isSupported).toBe(true);
    expect(result.zone?.id).toBe('zone_nasr_city');
    expect(result.deliveryFee).toBe(15);
  });

  it('should resolve delivery zone by side street name with normalized Arabic matching', async () => {
    const result = await service.resolveByStreetName('branch_01', 'شارع أحمد فخري');
    expect(result.isSupported).toBe(true);
    expect(result.zone?.id).toBe('zone_nasr_city');
  });

  it('should resolve delivery zone by GPS coordinates', async () => {
    const result = await service.resolveByGpsCoordinates('branch_01', 30.05, 31.33);
    expect(result.isSupported).toBe(true);
    expect(result.matchedBy).toBe('GPS');
  });

  it('should handle location outside delivery area and return nearest branch', async () => {
    mockRepo.findByBranchId.mockResolvedValue([]); // No zones for this branch

    const allBranches = [
      { id: 'branch_01', name: 'Downtown Branch', lat: 30.04, lng: 31.23 },
      { id: 'branch_02', name: 'Nasr City Branch', lat: 30.05, lng: 31.33 },
    ];

    const result = await service.resolveByGpsCoordinates('branch_01', 30.06, 31.34, allBranches);
    expect(result.isSupported).toBe(false);
    expect(result.nearestBranch?.branchId).toBe('branch_02');
    expect(result.message).toContain('outside the delivery area');
  });
});
