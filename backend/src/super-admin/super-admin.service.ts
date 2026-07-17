import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getAllCafes() {
    return this.prisma.cafe.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCafe(dto: { name: string; ownerCode: string; ownerPassword: string; phone: string }) {
    const existingCode = await this.prisma.cafe.findUnique({ where: { ownerCode: dto.ownerCode } });
    if (existingCode) throw new ConflictException('This owner code is already taken');

    const existingPhone = await this.prisma.cafe.findUnique({ where: { phone: dto.phone } });
    if (existingPhone) throw new ConflictException('This phone number is already registered');

    const hashedPass = await bcrypt.hash(dto.ownerPassword, 10);

    const cafe = await this.prisma.cafe.create({
      data: {
        name: dto.name,
        ownerCode: dto.ownerCode,
        ownerPassword: hashedPass,
        phone: dto.phone,
        active: true,
      },
    });

    // Create a default branch for the new cafe
    await this.prisma.branch.create({
      data: {
        name: 'Main Branch',
        slug: 'main-branch',
        cafeId: cafe.id,
        active: true,
      },
    });

    return cafe;
  }

  async updateCafe(id: string, dto: Partial<{ name: string; ownerCode: string; ownerPassword: string; phone: string; active: boolean }>) {
    if (dto.ownerPassword) {
      dto.ownerPassword = await bcrypt.hash(dto.ownerPassword, 10);
    }
    const updated = await this.prisma.cafe.update({
      where: { id },
      data: dto,
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: id,
      action: 'CAFE_UPDATE',
      entityType: 'Cafe',
      entityId: id,
    });

    return updated;
  }

  async deleteCafe(id: string) {
    const deleted = await this.prisma.cafe.delete({ where: { id } });

    this.eventEmitter.emit('audit.log', {
      cafeId: id,
      action: 'CAFE_DELETE',
      entityType: 'Cafe',
      entityId: id,
    });

    return deleted;
  }
}
