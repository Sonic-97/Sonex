import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IDeliveryZoneRepository } from '../../domain/repositories/delivery-zone.repository.interface';
import { DeliveryZone, DeliveryZoneProps } from '../../domain/aggregates/delivery-zone.aggregate';

export interface CreateDeliveryZoneInput {
  branchId: string;
  cafeId?: string;
  name: string;
  mainStreet: string;
  deliveryFee: number;
  minimumOrder: number;
  etaMinutes: number;
  streets?: string[];
}

@Injectable()
export class DeliveryZoneManagementService {
  constructor(
    @Inject('IDeliveryZoneRepository')
    private readonly zoneRepository: IDeliveryZoneRepository,
  ) {}

  public async createZone(input: CreateDeliveryZoneInput): Promise<DeliveryZone> {
    const id = `zone_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const zone = new DeliveryZone({
      id,
      branchId: input.branchId,
      cafeId: input.cafeId,
      name: input.name,
      mainStreet: input.mainStreet,
      deliveryFee: input.deliveryFee,
      minimumOrder: input.minimumOrder,
      etaMinutes: input.etaMinutes,
      isActive: true,
    });

    const saved = await this.zoneRepository.save(zone);

    if (input.streets && input.streets.length > 0) {
      for (let i = 0; i < input.streets.length; i++) {
        await this.zoneRepository.addStreet(saved.id, input.streets[i], i);
      }
      return (await this.zoneRepository.findById(saved.id))!;
    }

    return saved;
  }

  public async getZoneById(id: string): Promise<DeliveryZone> {
    const zone = await this.zoneRepository.findById(id);
    if (!zone) {
      throw new NotFoundException(`Delivery zone with ID '${id}' not found.`);
    }
    return zone;
  }

  public async getZonesByBranch(branchId: string): Promise<DeliveryZone[]> {
    return this.zoneRepository.findByBranchId(branchId);
  }

  public async getZonesByCafe(cafeId: string): Promise<DeliveryZone[]> {
    return this.zoneRepository.findByCafeId(cafeId);
  }

  public async updateZone(
    id: string,
    updates: Partial<Pick<DeliveryZoneProps, 'name' | 'mainStreet' | 'deliveryFee' | 'minimumOrder' | 'etaMinutes' | 'isActive'>>,
  ): Promise<DeliveryZone> {
    const zone = await this.getZoneById(id);
    zone.updatePolicy(updates);
    return this.zoneRepository.save(zone);
  }

  public async deleteZone(id: string): Promise<void> {
    await this.getZoneById(id);
    await this.zoneRepository.delete(id);
  }

  public async addStreetToZone(zoneId: string, streetName: string, displayOrder = 0): Promise<void> {
    await this.getZoneById(zoneId);
    await this.zoneRepository.addStreet(zoneId, streetName, displayOrder);
  }

  public async removeStreetFromZone(streetId: string): Promise<void> {
    await this.zoneRepository.removeStreet(streetId);
  }
}
