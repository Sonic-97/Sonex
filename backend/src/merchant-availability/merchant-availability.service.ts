import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MerchantStatus, MerchantAvailabilityData,
  MerchantAvailabilityEvent, MerchantAvailabilityEventType,
  STATUS_THRESHOLDS,
} from './merchant-availability.types';

const QUEUE_STATUSES = ['CREATED', 'ACCEPTED', 'PREPARING'];
const ACTIVE_STATUSES = ['CREATED', 'ACCEPTED', 'PREPARING', 'READY'];

@Injectable()
export class MerchantAvailabilityService {
  private readonly logger = new Logger(MerchantAvailabilityService.name);
  private readonly eventListeners: Array<(event: MerchantAvailabilityEvent) => void> = [];

  constructor(private readonly prisma: PrismaService) {}

  onEvent(listener: (event: MerchantAvailabilityEvent) => void): void {
    this.eventListeners.push(listener);
  }

  async computeAvailability(cafeId: string): Promise<MerchantAvailabilityData> {
    const [activeOrders, cafe] = await Promise.all([
      this.prisma.merchantOrder.findMany({
        where: { cafeId, status: { in: ACTIVE_STATUSES } },
        select: { status: true, preparationTimeMinutes: true },
      }),
      this.prisma.cafe.findUnique({
        where: { id: cafeId },
        select: { active: true, merchantAvailability: true },
      }),
    ]);

    if (!cafe) throw new Error('Cafe not found');

    const queueOrders = activeOrders.filter(o => QUEUE_STATUSES.includes(o.status));
    const queueLength = queueOrders.length;
    const activeOrderCount = activeOrders.length;

    const existing = cafe.merchantAvailability;
    const maxQueue = existing?.maxQueue ?? 10;
    const maxConcurrent = existing?.maxConcurrentOrders ?? 5;
    const avgPrep = existing?.averagePreparationTime ?? 15;

    const currentETA = queueLength > 0 ? avgPrep * queueLength : 0;

    const manualPaused = existing?.status === 'PAUSED';
    const manualClosed = existing?.status === 'CLOSED';

    let status: MerchantStatus;
    if (!cafe.active) {
      status = 'CLOSED';
    } else if (manualClosed) {
      status = 'CLOSED';
    } else if (manualPaused) {
      status = 'PAUSED';
    } else if (activeOrderCount === 0 && queueLength === 0) {
      status = 'OPEN';
    } else {
      const ratio = activeOrderCount / maxConcurrent;
      if (ratio >= STATUS_THRESHOLDS.veryBusyRatio) {
        status = 'VERY_BUSY';
      } else if (ratio >= STATUS_THRESHOLDS.busyRatio) {
        status = 'BUSY';
      } else {
        status = 'OPEN';
      }
    }

    const prevStatus = existing?.status as MerchantStatus | undefined;

    const record = await this.prisma.merchantAvailability.upsert({
      where: { cafeId },
      create: {
        cafeId,
        status,
        queueLength,
        currentETA,
        averagePreparationTime: avgPrep,
        maxQueue,
        maxConcurrentOrders: maxConcurrent,
        activeOrderCount,
      },
      update: {
        status,
        queueLength,
        currentETA,
        activeOrderCount,
      },
    });

    if (!prevStatus) {
      if (status !== 'OPEN') {
        this.emitInitial(status, cafeId, queueLength, currentETA);
      }
    } else if (prevStatus !== status) {
      this.emitStatusChange(prevStatus, status, cafeId, queueLength, currentETA);
    } else if (status !== 'OPEN' && queueLength > 0 && status !== 'PAUSED' && status !== 'CLOSED') {
      if (prevStatus !== 'BUSY' && status !== 'VERY_BUSY') {
        this.emit('ETAChanged', cafeId, prevStatus, status, queueLength, currentETA);
      }
    }

    return this.toData(record);
  }

  async recalculateAll(): Promise<number> {
    const cafes = await this.prisma.cafe.findMany({
      where: { active: true },
      select: { id: true },
    });

    let count = 0;
    for (const cafe of cafes) {
      try {
        await this.computeAvailability(cafe.id);
        count++;
      } catch (e) {
        this.logger.error(`Failed to compute availability for cafe ${cafe.id}`, e);
      }
    }
    return count;
  }

  async getAvailability(cafeId: string): Promise<MerchantAvailabilityData | null> {
    const record = await this.prisma.merchantAvailability.findUnique({
      where: { cafeId },
    });
    if (!record) return null;
    return this.toData(record);
  }

  async getManyAvailability(cafeIds: string[]): Promise<Map<string, MerchantAvailabilityData>> {
    const records = await this.prisma.merchantAvailability.findMany({
      where: { cafeId: { in: cafeIds } },
    });
    const map = new Map<string, MerchantAvailabilityData>();
    for (const r of records) {
      map.set(r.cafeId, this.toData(r));
    }
    return map;
  }

  async pause(cafeId: string): Promise<MerchantAvailabilityData> {
    const record = await this.prisma.merchantAvailability.upsert({
      where: { cafeId },
      create: { cafeId, status: 'PAUSED' },
      update: { status: 'PAUSED' },
    });

    const prevStatus = (record.status === 'PAUSED' ? 'OPEN' : record.status) as MerchantStatus;
    this.emit('MerchantPaused', cafeId, prevStatus, 'PAUSED', record.queueLength, record.currentETA);
    return this.toData(record);
  }

  async resume(cafeId: string): Promise<MerchantAvailabilityData> {
    await this.prisma.merchantAvailability.upsert({
      where: { cafeId },
      create: { cafeId },
      update: { status: 'OPEN' },
    });
    return this.computeAvailability(cafeId);
  }

  async setConfig(
    cafeId: string,
    config: { averagePreparationTime?: number; maxQueue?: number; maxConcurrentOrders?: number },
  ): Promise<MerchantAvailabilityData> {
    const record = await this.prisma.merchantAvailability.upsert({
      where: { cafeId },
      create: { cafeId, ...config },
      update: config,
    });
    return this.computeAvailability(cafeId);
  }

  private emitInitial(
    status: MerchantStatus,
    cafeId: string,
    queueLength: number,
    currentETA: number,
  ): void {
    if (status === 'BUSY' || status === 'VERY_BUSY') {
      this.emit('MerchantBusy', cafeId, undefined, status, queueLength, currentETA);
    } else if (status === 'CLOSED') {
      this.emit('MerchantClosed', cafeId, undefined, status, queueLength, currentETA);
    }
  }

  private emitStatusChange(
    prev: MerchantStatus,
    curr: MerchantStatus,
    cafeId: string,
    queueLength: number,
    currentETA: number,
  ): void {
    const isBusy = curr === 'BUSY' || curr === 'VERY_BUSY';
    const wasBusy = prev === 'BUSY' || prev === 'VERY_BUSY';

    if (isBusy && !wasBusy) {
      this.emit('MerchantBusy', cafeId, prev, curr, queueLength, currentETA);
    } else if (!isBusy && wasBusy) {
      this.emit('MerchantRecovered', cafeId, prev, curr, queueLength, currentETA);
    }

    if (curr === 'PAUSED' && prev !== 'PAUSED') {
      this.emit('MerchantPaused', cafeId, prev, curr, queueLength, currentETA);
    }

    if (curr === 'CLOSED' && prev !== 'CLOSED') {
      this.emit('MerchantClosed', cafeId, prev, curr, queueLength, currentETA);
    } else if (curr !== 'CLOSED' && (prev === 'CLOSED' || prev === 'OFFLINE')) {
      this.emit('MerchantOpened', cafeId, prev, curr, queueLength, currentETA);
    }
  }

  private emit(
    type: MerchantAvailabilityEventType,
    cafeId: string,
    previousStatus: MerchantStatus | undefined,
    currentStatus: MerchantStatus,
    queueLength: number,
    currentETA: number,
  ): void {
    const event: MerchantAvailabilityEvent = {
      type,
      cafeId,
      previousStatus,
      currentStatus,
      queueLength,
      currentETA,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.eventListeners) {
      try { listener(event); } catch (e) { this.logger.error('Event listener error', e); }
    }
  }

  private toData(record: any): MerchantAvailabilityData {
    return {
      cafeId: record.cafeId,
      status: record.status as MerchantStatus,
      queueLength: record.queueLength,
      currentETA: record.currentETA,
      averagePreparationTime: record.averagePreparationTime,
      maxQueue: record.maxQueue,
      maxConcurrentOrders: record.maxConcurrentOrders,
      activeOrderCount: record.activeOrderCount,
    };
  }
}
