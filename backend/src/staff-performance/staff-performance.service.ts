import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class StaffPerformanceService {
  private readonly logger = new Logger(StaffPerformanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  // ── EVENT-DRIVEN UPDATES ──

  @OnEvent('order.status.changed')
  async onOrderStatusChanged(event: AppEvent) {
    const payload = event.payload as {
      orderId: string;
      status: string;
      from: string;
      staffId?: string;
    };

    if (!payload.staffId) return;

    if (['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'].includes(payload.status)) {
      await this.updateOnOrderEvent(payload.staffId, payload.orderId, payload.status);
    }
  }

  @OnEvent('order.created')
  async onOrderCreated(event: AppEvent) {
    const payload = event.payload as {
      orderId: string;
      staffId?: string;
    };

    if (!payload.staffId) return;
    await this.updateOnOrderEvent(payload.staffId, payload.orderId, 'NEW');
  }

  // ── CORE SCORING ──

  async updateOnOrderEvent(staffId: string, orderId: string, status: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) return;

    await this.calculateStaffMetrics(staffId, today, order, status);
  }

  async calculateStaffMetrics(
    staffId: string,
    date: Date,
    order: { id: string; status: string; total: Prisma.Decimal; profit?: Prisma.Decimal | null; createdAt: Date; items: { product: { cost: Prisma.Decimal }; unitPrice: Prisma.Decimal; quantity: number }[] },
    currentStatus: string,
  ) {
    const todayStart = new Date(date);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(date);
    todayEnd.setHours(23, 59, 59, 999);

    // Get all orders handled by this staff member today
    const staffOrders = await this.prisma.order.findMany({
      where: {
        staffId,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      include: { items: { include: { product: true } } },
    });

    const handled = staffOrders.filter((o) => o.status !== 'CANCELLED');
    const cancelled = staffOrders.filter((o) => o.status === 'CANCELLED');
    const completed = staffOrders.filter((o) => o.status === 'DELIVERED');

    const ordersHandled = handled.length;
    const cancellationCount = cancelled.length;
    const completionRate = ordersHandled > 0
      ? Math.round((completed.length / (ordersHandled + cancellationCount)) * 10000) / 100
      : 100;

    const totalRevenue = handled.reduce((sum, o) => sum + Number(o.total), 0);

    const totalProfit = handled.reduce((sum, o) => {
      const profit = handled.length > 0 && o.profit ? Number(o.profit) : 0;
      return sum + profit;
    }, 0);

    // Calculate avg processing time (createdAt → deliveredAt or cancelledAt)
    let totalProcessingTime = 0;
    let processingCount = 0;
    for (const o of handled) {
      if (o.deliveredAt) {
        totalProcessingTime += (o.deliveredAt.getTime() - o.createdAt.getTime()) / 60000;
        processingCount++;
      }
    }
    const avgOrderProcessingTime = processingCount > 0
      ? Math.round((totalProcessingTime / processingCount) * 100) / 100
      : 0;

    // ── SCORE COMPUTATION ──

    // RevenueScore: based on total revenue (max benchmark: $500/day = 100)
    const revenueScore = Math.min(100, Math.round((totalRevenue / 500) * 100));

    // EfficiencyScore: orders handled (max benchmark: 30 orders/day = 100)
    const efficiencyScore = Math.min(100, Math.round((ordersHandled / 30) * 100));

    // SpeedScore: avg processing time (5 min = 100, 30 min = 0)
    const speedScore = avgOrderProcessingTime > 0
      ? Math.max(0, Math.min(100, Math.round(100 - (avgOrderProcessingTime / 30) * 100)))
      : 50;

    // ReliabilityScore: completion rate
    const reliabilityScore = Math.min(100, Math.round(completionRate));

    // Overall score (weighted)
    const overallScore = Math.round(
      revenueScore * 0.30 +
      efficiencyScore * 0.25 +
      speedScore * 0.20 +
      reliabilityScore * 0.25
    );

    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    const cafeId = staff?.cafeId ?? '';

    // Upsert performance record
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.staffPerformance.findUnique({
        where: { cafeId_staffId_date: { cafeId, staffId, date: todayStart } },
      });

      const data = {
        ordersHandled,
        totalRevenue: new Prisma.Decimal(totalRevenue),
        totalProfitContribution: new Prisma.Decimal(totalProfit),
        avgOrderProcessingTime,
        cancellationCount,
        completionRate,
        efficiencyScore,
        revenueScore,
        speedScore,
        reliabilityScore,
        overallScore,
      };

      if (existing) {
        await tx.staffPerformance.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await tx.staffPerformance.create({
          data: {
            cafeId,
            staffId,
            date: todayStart,
            ...data,
          } as any,
        });
      }
    });

    this.eventsService.emitToOwner('staff.performance.updated', {
      staffId,
      staffName: staff?.name || 'Unknown',
      date: todayStart.toISOString(),
      ordersHandled,
      totalRevenue,
      overallScore,
      revenueScore,
      efficiencyScore,
      speedScore,
      reliabilityScore,
    });

    // Detect and emit alerts
    if (overallScore < 40) {
      this.eventsService.emitToOwner('staff.alert.generated', {
        staffId,
        staffName: staff?.name || 'Unknown',
        type: 'LOW_PERFORMANCE',
        severity: 'high',
        message: `Staff member ${staff?.name || 'Unknown'} has a low performance score (${overallScore}/100)`,
      });
    }

    if (cancellationCount > 3) {
      this.eventsService.emitToOwner('staff.alert.generated', {
        staffId,
        staffName: staff?.name || 'Unknown',
        type: 'HIGH_CANCELLATION',
        severity: 'medium',
        message: `Staff member ${staff?.name || 'Unknown'} has ${cancellationCount} cancellations today`,
      });
    }

    this.logger.log(`Performance updated for ${staff?.name || staffId}: ${overallScore}/100`);
  }

  // ── QUERY HELPERS ──

  async getStaffScore(staffId: string, cafeId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    const ownerCafeId = cafeId ?? (staff?.cafeId ?? '');

    const perf = await this.prisma.staffPerformance.findUnique({
      where: { cafeId_staffId_date: { cafeId: ownerCafeId, staffId, date: today } },
    });

    return {
      staffId,
      staffName: staff?.name || 'Unknown',
      role: staff?.role || 'Unknown',
      performance: perf || null,
    };
  }

  async getTopPerformers(limit = 5, from?: Date, to?: Date, cafeId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const performances = await this.prisma.staffPerformance.findMany({
      where: {
        date: from || today,
        overallScore: { gt: 0 },
      },
      orderBy: { overallScore: 'desc' },
      take: limit,
      include: { staff: true },
    });

    return performances.map((p) => ({
      staffId: p.staffId,
      staffName: p.staff.name,
      role: p.staff.role,
      overallScore: p.overallScore,
      ordersHandled: p.ordersHandled,
      totalRevenue: Number(p.totalRevenue),
      revenueScore: p.revenueScore,
      efficiencyScore: p.efficiencyScore,
      speedScore: p.speedScore,
      reliabilityScore: p.reliabilityScore,
    }));
  }

  async getUnderperformers(threshold = 40, from?: Date, to?: Date, cafeId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const performances = await this.prisma.staffPerformance.findMany({
      where: {
        date: from || today,
        overallScore: { lt: threshold },
      },
      orderBy: { overallScore: 'asc' },
      include: { staff: true },
    });

    return performances.map((p) => ({
      staffId: p.staffId,
      staffName: p.staff.name,
      role: p.staff.role,
      overallScore: p.overallScore,
      ordersHandled: p.ordersHandled,
      cancellationCount: p.cancellationCount,
      completionRate: p.completionRate,
      avgOrderProcessingTime: p.avgOrderProcessingTime,
      reason: `Score ${p.overallScore} is below threshold ${threshold}`,
    }));
  }

  async getPerformanceHistory(staffId: string, days = 7, cafeId?: string) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const performances = await this.prisma.staffPerformance.findMany({
      where: {
        staffId,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    return performances.map((p) => ({
      date: p.date.toISOString().slice(0, 10),
      overallScore: p.overallScore,
      revenueScore: p.revenueScore,
      efficiencyScore: p.efficiencyScore,
      speedScore: p.speedScore,
      reliabilityScore: p.reliabilityScore,
      ordersHandled: p.ordersHandled,
      avgOrderProcessingTime: p.avgOrderProcessingTime,
    }));
  }

  async getOverview(cafeId?: string) {
    const [topPerformers, underperformers] = await Promise.all([
      this.getTopPerformers(5),
      this.getUnderperformers(40),
    ]);

    const allScores = await this.prisma.staffPerformance.findMany({
      where: {
        date: new Date(new Date().setHours(0, 0, 0, 0)),
      },
      include: { staff: true },
    });

    const avgScore = allScores.length > 0
      ? Math.round(allScores.reduce((s, p) => s + p.overallScore, 0) / allScores.length)
      : 0;

    return {
      avgScore,
      topPerformers,
      underperformers,
      totalTracked: allScores.length,
    };
  }
}




