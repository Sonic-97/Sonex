import { CustomerLocationService } from '../application/services/customer-location.service';
import { ZoneResolverService } from '../application/services/zone-resolver.service';
import { GeoLocationService } from '../application/services/geo-location.service';
import { ICustomerLocationRepository } from '../domain/repositories/customer-location.repository.interface';
import { DeliveryZone } from '../domain/aggregates/delivery-zone.aggregate';
import { CustomerLocation } from '../domain/aggregates/customer-location.aggregate';

describe('CustomerLocationService', () => {
  let service: CustomerLocationService;
  let mockRepo: jest.Mocked<ICustomerLocationRepository>;
  let zoneResolver: ZoneResolverService;
  let geoLocation: GeoLocationService;

  const sampleZone = new DeliveryZone({
    id: 'zone_01',
    branchId: 'branch_01',
    name: 'Nasr City',
    mainStreet: 'Abbas El Akkad',
    deliveryFee: 15,
    minimumOrder: 50,
    etaMinutes: 30,
    isActive: true,
  });

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByCustomerId: jest.fn(),
      findDefaultByCustomerId: jest.fn(),
      save: jest.fn().mockImplementation((loc) => Promise.resolve(loc)),
      setDefault: jest.fn(),
      delete: jest.fn(),
    };

    geoLocation = new GeoLocationService();
    const mockZoneRepo = {
      findById: jest.fn(),
      findByBranchId: jest.fn().mockResolvedValue([sampleZone]),
      findByCafeId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      addStreet: jest.fn(),
      removeStreet: jest.fn(),
    };

    zoneResolver = new ZoneResolverService(mockZoneRepo, geoLocation);
    service = new CustomerLocationService(mockRepo, zoneResolver, geoLocation);
  });

  it('should automatically save incoming GPS as default location for first-time customer', async () => {
    mockRepo.findDefaultByCustomerId.mockResolvedValue(null);

    const result = await service.handleIncomingGpsLocation('cust_01', 'branch_01', 30.05, 31.33);

    expect(result.promptChoiceRequired).toBe(false);
    expect(result.location.isDefault).toBe(true);
    expect(result.location.mainStreet).toBe('Abbas El Akkad');
  });

  it('should prompt customer with options when a new location in a different zone is sent', async () => {
    const existingLoc = new CustomerLocation({
      id: 'loc_01',
      customerId: 'cust_01',
      branchId: 'branch_01',
      zoneId: 'zone_different',
      mainStreet: 'Old Street',
      isDefault: true,
    });

    mockRepo.findDefaultByCustomerId.mockResolvedValue(existingLoc);

    const result = await service.handleIncomingGpsLocation('cust_01', 'branch_01', 30.05, 31.33);

    expect(result.promptChoiceRequired).toBe(true);
    expect(result.promptMessage).toContain('استخدام لهذا الطلب فقط');
  });

  it('should apply customer location override decision SAVE_NEW', async () => {
    const draft = {
      customerId: 'cust_01',
      branchId: 'branch_01',
      zoneId: 'zone_01',
      mainStreet: 'New Street',
    };

    const saved = await service.applyLocationOverrideChoice('cust_01', draft, 'SAVE_NEW');
    expect(saved.isDefault).toBe(false);
    expect(mockRepo.save).toHaveBeenCalled();
  });
});
