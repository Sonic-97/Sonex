import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ICustomerLocationRepository } from '../../domain/repositories/customer-location.repository.interface';
import { CustomerLocation } from '../../domain/aggregates/customer-location.aggregate';

@Injectable()
export class PrismaCustomerLocationRepository implements ICustomerLocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<CustomerLocation | null> {
    const raw = await this.prisma.customerLocation.findUnique({
      where: { id },
    });
    if (!raw) return null;
    return this.toDomain(raw);
  }

  public async findByCustomerId(customerId: string): Promise<CustomerLocation[]> {
    const raw = await this.prisma.customerLocation.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return raw.map((item) => this.toDomain(item));
  }

  public async findDefaultByCustomerId(customerId: string): Promise<CustomerLocation | null> {
    const raw = await this.prisma.customerLocation.findFirst({
      where: { customerId, isDefault: true },
    });
    if (!raw) {
      // Fallback to most recently used location if no location is marked default
      const fallback = await this.prisma.customerLocation.findFirst({
        where: { customerId },
        orderBy: { lastUsedAt: 'desc' },
      });
      return fallback ? this.toDomain(fallback) : null;
    }
    return this.toDomain(raw);
  }

  public async save(location: CustomerLocation): Promise<CustomerLocation> {
    if (location.isDefault) {
      // Unset previous defaults for customer
      await this.prisma.customerLocation.updateMany({
        where: { customerId: location.customerId, isDefault: true, id: { not: location.id } },
        data: { isDefault: false },
      });
    }

    const data = {
      customerId: location.customerId,
      branchId: location.branchId,
      zoneId: location.zoneId ?? undefined,
      label: location.label,
      mainStreet: location.mainStreet,
      subStreet: location.subStreet ?? undefined,
      buildingNumber: location.buildingNumber ?? undefined,
      floor: location.floor ?? undefined,
      apartment: location.apartment ?? undefined,
      landmark: location.landmark ?? undefined,
      latitude: location.latitude ?? undefined,
      longitude: location.longitude ?? undefined,
      googlePlaceId: location.googlePlaceId ?? undefined,
      isDefault: location.isDefault,
      lastUsedAt: location.lastUsedAt ?? undefined,
    };

    const saved = await this.prisma.customerLocation.upsert({
      where: { id: location.id },
      create: {
        id: location.id,
        ...data,
      },
      update: data,
    });

    return this.toDomain(saved);
  }

  public async setDefault(customerId: string, locationId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.customerLocation.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.customerLocation.update({
        where: { id: locationId },
        data: { isDefault: true, lastUsedAt: new Date() },
      }),
    ]);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.customerLocation.delete({ where: { id } });
  }

  private toDomain(raw: any): CustomerLocation {
    return new CustomerLocation({
      id: raw.id,
      customerId: raw.customerId,
      branchId: raw.branchId,
      zoneId: raw.zoneId,
      label: raw.label,
      mainStreet: raw.mainStreet,
      subStreet: raw.subStreet,
      buildingNumber: raw.buildingNumber,
      floor: raw.floor,
      apartment: raw.apartment,
      landmark: raw.landmark,
      latitude: raw.latitude !== null ? Number(raw.latitude) : null,
      longitude: raw.longitude !== null ? Number(raw.longitude) : null,
      googlePlaceId: raw.googlePlaceId,
      isDefault: raw.isDefault,
      lastUsedAt: raw.lastUsedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
