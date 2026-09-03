import { DeliveryZone } from '../aggregates/delivery-zone.aggregate';

export interface IDeliveryZoneRepository {
  findById(id: string): Promise<DeliveryZone | null>;
  findByBranchId(branchId: string): Promise<DeliveryZone[]>;
  findByCafeId(cafeId: string): Promise<DeliveryZone[]>;
  save(zone: DeliveryZone): Promise<DeliveryZone>;
  delete(id: string): Promise<void>;
  addStreet(zoneId: string, streetName: string, displayOrder?: number): Promise<void>;
  removeStreet(streetId: string): Promise<void>;
}
