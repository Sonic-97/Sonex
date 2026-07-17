import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriverDispatchService } from '../driver-dispatch/driver-dispatch.service';
import { DriverPresenceService } from '../driver-presence/driver-presence.service';
import { OrderOrchestratorService } from '../order-orchestrator/order-orchestrator.service';
import {
  DriverLoginRequest, DriverLoginResponse,
  DriverProfileResponse, DriverAssignmentResponse,
  DriverLocationUpdate, DriverStatusUpdate,
  AuthPayload, DriverActionResponse,
} from './driver-api.types';
import { DriverApiAuthGuard } from './driver-api-auth.guard';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

@Injectable()
export class DriverApiService {
  private readonly logger = new Logger(DriverApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DriverDispatchService,
    private readonly presence: DriverPresenceService,
    private readonly orchestrator: OrderOrchestratorService,
  ) {}

  async login(body: DriverLoginRequest): Promise<DriverLoginResponse> {
    const driver = await this.prisma.driver.findUnique({ where: { id: body.driverId } });
    if (!driver || driver.phone !== body.apiKey) {
      throw new NotFoundException('Invalid driver credentials');
    }
    const token = generateToken();
    const payload: AuthPayload = { driverId: driver.id };
    DriverApiAuthGuard.registerToken(token, payload);
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    return { token, driverId: driver.id, expiresAt };
  }

  async getProfile(driverId: string): Promise<DriverProfileResponse> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return {
      driverId: driver.id,
      name: driver.name,
      phone: driver.phone,
      status: driver.driverStatus,
      vehicleType: driver.vehicleType,
      capacity: driver.capacity,
      activeAssignments: driver.activeAssignments,
      totalDeliveries: driver.totalDeliveries,
    };
  }

  async getAssignments(driverId: string): Promise<DriverAssignmentResponse[]> {
    const records = await this.prisma.driverAssignment.findMany({
      where: { driverId },
      include: {
        merchantOrder: {
          select: {
            id: true,
            customerOrderId: true,
            cafeId: true,
            businessName: true,
            status: true,
            pickupSequence: true,
            estimatedReadyAt: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return records.map(r => ({
      assignmentId: r.id,
      merchantOrderId: r.merchantOrderId,
      customerOrderId: r.merchantOrder.customerOrderId,
      status: r.status,
      score: r.score ? Number(r.score) : null,
      assignedAt: r.assignedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      respondedAt: r.respondedAt?.toISOString() ?? null,
      merchantName: r.merchantOrder.businessName || 'Unknown',
      merchantStatus: r.merchantOrder.status,
      pickupSequence: r.merchantOrder.pickupSequence,
      estimatedReadyAt: r.merchantOrder.estimatedReadyAt?.toISOString() ?? null,
    }));
  }

  async getAssignment(driverId: string, assignmentId: string): Promise<DriverAssignmentResponse> {
    const record = await this.findOwnAssignment(driverId, assignmentId);
    return {
      assignmentId: record.id,
      merchantOrderId: record.merchantOrderId,
      customerOrderId: record.merchantOrder.customerOrderId,
      status: record.status,
      score: record.score ? Number(record.score) : null,
      assignedAt: record.assignedAt.toISOString(),
      expiresAt: record.expiresAt?.toISOString() ?? null,
      respondedAt: record.respondedAt?.toISOString() ?? null,
      merchantName: record.merchantOrder.businessName || 'Unknown',
      merchantStatus: record.merchantOrder.status,
      pickupSequence: record.merchantOrder.pickupSequence,
      estimatedReadyAt: record.merchantOrder.estimatedReadyAt?.toISOString() ?? null,
    };
  }

  async acceptAssignment(driverId: string, assignmentId: string): Promise<DriverActionResponse> {
    const record = await this.findOwnAssignment(driverId, assignmentId);
    if (record.status !== 'PENDING') {
      if (record.status === 'ACCEPTED') {
        throw new ConflictException('AssignmentAlreadyAccepted');
      }
      throw new BadRequestException('Assignment cannot be accepted in current status');
    }
    if (record.expiresAt && new Date() > record.expiresAt) {
      throw new BadRequestException('AssignmentExpired');
    }
    await this.dispatch.acceptAssignment(assignmentId);
    return { success: true, message: 'Assignment accepted' };
  }

  async rejectAssignment(driverId: string, assignmentId: string): Promise<DriverActionResponse> {
    const record = await this.findOwnAssignment(driverId, assignmentId);
    if (record.status !== 'PENDING') {
      throw new BadRequestException('Assignment cannot be rejected in current status');
    }
    await this.dispatch.rejectAssignment(assignmentId);
    return { success: true, message: 'Assignment rejected' };
  }

  async completePickup(driverId: string, assignmentId: string): Promise<DriverActionResponse> {
    const record = await this.findOwnAssignment(driverId, assignmentId);
    if (record.status !== 'ACCEPTED') {
      throw new BadRequestException('Assignment must be accepted before pickup');
    }
    await this.orchestrator.pickupMerchantOrder(record.merchantOrderId);
    return { success: true, message: 'Pickup completed' };
  }

  async completeDelivery(driverId: string, assignmentId: string): Promise<DriverActionResponse> {
    const record = await this.findOwnAssignment(driverId, assignmentId);
    if (record.status !== 'ACCEPTED') {
      throw new BadRequestException('Assignment must be accepted before delivery');
    }
    const customerOrderId = record.merchantOrder.customerOrderId;
    await this.orchestrator.completeMerchantOrder(record.merchantOrderId);
    await this.orchestrator.deliverCustomerOrder(customerOrderId);
    return { success: true, message: 'Delivery completed' };
  }

  async updateLocation(driverId: string, location: DriverLocationUpdate): Promise<DriverActionResponse> {
    if (location.latitude == null || location.longitude == null) {
      throw new BadRequestException('Latitude and longitude are required');
    }
    if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      throw new BadRequestException('Invalid coordinate format');
    }
    if (location.latitude < -90 || location.latitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (location.longitude < -180 || location.longitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }
    await this.presence.updateLocation(driverId, location.latitude, location.longitude);
    return { success: true, message: 'Location updated' };
  }

  async updateStatus(driverId: string, statusUpdate: DriverStatusUpdate): Promise<DriverActionResponse> {
    const status = statusUpdate.status;
    if (!['ONLINE', 'OFFLINE', 'PAUSED'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    switch (status) {
      case 'ONLINE':
        if (driver.driverStatus === 'OFFLINE') {
          await this.presence.goOnline(driverId);
        } else if (driver.driverStatus === 'PAUSED') {
          await this.presence.resume(driverId);
        }
        break;
      case 'OFFLINE':
        await this.presence.goOffline(driverId);
        break;
      case 'PAUSED':
        await this.presence.pause(driverId);
        break;
    }
    return { success: true, message: `Status updated to ${status}` };
  }

  private async findOwnAssignment(driverId: string, assignmentId: string) {
    const record = await this.prisma.driverAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        merchantOrder: {
          select: {
            customerOrderId: true,
            businessName: true,
            status: true,
            pickupSequence: true,
            estimatedReadyAt: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException('AssignmentNotFound');
    if (record.driverId !== driverId) throw new NotFoundException('AssignmentNotFound');
    return record;
  }
}
