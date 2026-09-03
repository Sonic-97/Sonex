import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IDeliveryZoneRepository } from '../../domain/repositories/delivery-zone.repository.interface';
import { DeliveryZone } from '../../domain/aggregates/delivery-zone.aggregate';
import { DeliveryZoneStreet } from '../../domain/entities/delivery-zone-street.entity';

@Injectable()
export class PrismaDeliveryZoneRepository implements IDeliveryZoneRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<DeliveryZone | null> {
    const raw = await this.prisma.deliveryZone.findUnique({
      where: { id },
      include: { streets: true },
    });
    if (!raw) return null;
    return this.toDomain(raw);
  }

  public async findByBranchId(branchId: string): Promise<DeliveryZone[]> {
    const raw = await this.prisma.deliveryZone.findMany({
      where: { branchId, isActive: true },
      include: { streets: true },
      orderBy: { name: 'asc' },
    });
    return raw.map((item) => this.toDomain(item));
  }

  public async findByCafeId(cafeId: string): Promise<DeliveryZone[]> {
    const raw = await this.prisma.deliveryZone.findMany({
      where: { cafeId, isActive: true },
      include: { streets: true },
      orderBy: { name: 'asc' },
    });
    return raw.map((item) => this.toDomain(item));
  }

  public async save(zone: DeliveryZone): Promise<DeliveryZone> {
    const data = {
      branchId: zone.branchId,
      cafeId: zone.cafeId ?? undefined,
      name: zone.name,
      mainStreet: zone.mainStreet,
      deliveryFee: zone.deliveryFee,
      minimumOrder: zone.minimumOrder,
      etaMinutes: zone.etaMinutes,
      isActive: zone.isActive,
    };

    const saved = await this.prisma.deliveryZone.upsert({
      where: { id: zone.id },
      create: {
        id: zone.id,
        ...data,
      },
      update: data,
      include: { streets: true },
    });

    return this.toDomain(saved);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.deliveryZone.delete({ where: { id } });
  }

  public async addStreet(zoneId: string, streetName: string, displayOrder = 0): Promise<void> {
    await this.prisma.deliveryZoneStreet.create({
      data: {
        zoneId,
        streetName,
        displayOrder,
      },
    });
  }

  public async removeStreet(streetId: string): Promise<void> {
    await this.prisma.deliveryZoneStreet.delete({
      where: { id: streetId },
    });
  }

  private toDomain(raw: any): DeliveryZone {
    const streets = (raw.streets || []).map(
      (s: any) => new DeliveryZoneStreet(s.id, s.zoneId, s.streetName, s.displayOrder),
    );
    return new DeliveryZone({
      id: raw.id,
      branchId: raw.branchId,
      cafeId: raw.cafeId,
      name: raw.name,
      mainStreet: raw.mainStreet,
      deliveryFee: Number(raw.deliveryFee),
      minimumOrder: Number(raw.minimumOrder),
      etaMinutes: raw.etaMinutes,
      isActive: raw.isActive,
      streets,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
