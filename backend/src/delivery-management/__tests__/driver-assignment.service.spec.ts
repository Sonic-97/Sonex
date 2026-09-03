import { DriverAssignmentService } from '../application/services/driver-assignment.service';
import { CustomerLocation } from '../domain/aggregates/customer-location.aggregate';
import { DeliveryZone } from '../domain/aggregates/delivery-zone.aggregate';

describe('DriverAssignmentService', () => {
  let service: DriverAssignmentService;

  const loc = new CustomerLocation({
    id: 'loc_01',
    customerId: 'cust_01',
    branchId: 'branch_01',
    zoneId: 'zone_01',
    label: 'Home',
    mainStreet: 'Abbas El Akkad',
    subStreet: 'Ahmed Fakhry',
    buildingNumber: '15',
    floor: '3',
    apartment: '12',
    landmark: 'Behind Costa',
    latitude: 30.05,
    longitude: 31.33,
  });

  const zone = new DeliveryZone({
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
    service = new DriverAssignmentService();
  });

  it('should generate complete driver payload with Google Maps deep link and formatted address', () => {
    const payload = service.generateDriverPayload('ord_100', 'Ahmed Mostafa', '+201000000000', loc, zone);

    expect(payload.orderId).toBe('ord_100');
    expect(payload.customerName).toBe('Ahmed Mostafa');
    expect(payload.zoneName).toBe('Nasr City');
    expect(payload.googleMapsDeepLink).toBe('https://www.google.com/maps/search/?api=1&query=30.05,31.33');
    expect(payload.formattedAddress).toContain('Abbas El Akkad');
    expect(payload.buildingNumber).toBe('15');
    expect(payload.floor).toBe('3');
    expect(payload.apartment).toBe('12');
  });
});
