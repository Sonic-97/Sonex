import { CustomerLocation } from '../aggregates/customer-location.aggregate';

export interface ICustomerLocationRepository {
  findById(id: string): Promise<CustomerLocation | null>;
  findByCustomerId(customerId: string): Promise<CustomerLocation[]>;
  findDefaultByCustomerId(customerId: string): Promise<CustomerLocation | null>;
  save(location: CustomerLocation): Promise<CustomerLocation>;
  setDefault(customerId: string, locationId: string): Promise<void>;
  delete(id: string): Promise<void>;
}
