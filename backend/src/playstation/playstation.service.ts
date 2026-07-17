import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateDeviceDto, UpdateDeviceDto, UpdatePricingDto, StartSessionDto } from './dto/playstation.dto';

@Injectable()
export class PlayStationService {
  private readonly logger = new Logger(PlayStationService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ── DEVICES ──

  async getDevices(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');
    
    let devices = await this.prisma.playStationDevice.findMany({
      where: { cafeId },
      orderBy: { name: 'asc' },
    });

    // Auto-seed one device if none exist
    if (devices.length === 0) {
      const defaultDevice = await this.prisma.playStationDevice.create({
        data: {
          cafeId,
          name: 'PS Device 1',
        },
      });
      devices = [defaultDevice];
    }

    return devices;
  }

  async createDevice(dto: CreateDeviceDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    // Check unique name per cafe
    const existing = await this.prisma.playStationDevice.findFirst({
      where: { cafeId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new BadRequestException('اسم الجهاز مستخدم بالفعل في هذا الكافيه');
    }

    return this.prisma.playStationDevice.create({
      data: {
        cafeId,
        name: dto.name,
      },
    });
  }

  async updateDevice(id: string, dto: UpdateDeviceDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const device = await this.prisma.playStationDevice.findFirst({
      where: { id, cafeId },
    });
    if (!device) {
      throw new NotFoundException('الجهاز غير موجود في هذا الكافيه');
    }

    if (dto.name) {
      // Check unique name per cafe excluding this device
      const existing = await this.prisma.playStationDevice.findFirst({
        where: {
          cafeId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException('اسم الجهاز مستخدم بالفعل في هذا الكافيه');
      }
    }

    return this.prisma.playStationDevice.update({
      where: { id },
      data: {
        name: dto.name,
        active: dto.active,
      },
    });
  }

  async deleteDevice(id: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const device = await this.prisma.playStationDevice.findFirst({
      where: { id, cafeId },
    });
    if (!device) {
      throw new NotFoundException('الجهاز غير موجود في هذا الكافيه');
    }

    // Check if there are active sessions on this device
    const activeSession = await this.prisma.playStationSession.findFirst({
      where: { deviceId: id, endTime: null },
    });
    if (activeSession) {
      throw new BadRequestException('لا يمكن حذف الجهاز لوجود جلسة نشطة حالياً');
    }

    return this.prisma.playStationDevice.delete({
      where: { id },
    });
  }

  // ── PRICING ──

  async getPricing(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    let pricing = await this.prisma.playStationPricing.findUnique({
      where: { cafeId },
    });

    if (!pricing) {
      pricing = await this.prisma.playStationPricing.create({
        data: {
          cafeId,
          singlePlayerHourlyPrice: new Prisma.Decimal(20.00),
          twoPlayersHourlyPrice: new Prisma.Decimal(30.00),
          threePlayersHourlyPrice: new Prisma.Decimal(40.00),
          fourPlayersHourlyPrice: new Prisma.Decimal(50.00),
        },
      });
    }

    return pricing;
  }

  async updatePricing(dto: UpdatePricingDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    return this.prisma.playStationPricing.upsert({
      where: { cafeId },
      update: {
        singlePlayerHourlyPrice: new Prisma.Decimal(dto.singlePlayerHourlyPrice),
        twoPlayersHourlyPrice: new Prisma.Decimal(dto.twoPlayersHourlyPrice),
        threePlayersHourlyPrice: new Prisma.Decimal(dto.threePlayersHourlyPrice),
        fourPlayersHourlyPrice: new Prisma.Decimal(dto.fourPlayersHourlyPrice),
      },
      create: {
        cafeId,
        singlePlayerHourlyPrice: new Prisma.Decimal(dto.singlePlayerHourlyPrice),
        twoPlayersHourlyPrice: new Prisma.Decimal(dto.twoPlayersHourlyPrice),
        threePlayersHourlyPrice: new Prisma.Decimal(dto.threePlayersHourlyPrice),
        fourPlayersHourlyPrice: new Prisma.Decimal(dto.fourPlayersHourlyPrice),
      },
    });
  }

  // ── SESSIONS ──

  async getActiveSessions(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const sessions = await this.prisma.playStationSession.findMany({
      where: {
        cafeId,
        status: { in: ['Pending Free Time', 'Running'] },
      },
      include: {
        device: true,
        openedBy: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    // Lazy evaluation state transition: transition to Running if free period elapsed
    const now = new Date();
    for (const session of sessions) {
      if (session.status === 'Pending Free Time') {
        const freeEnd = session.freePeriodEndTime
          ? new Date(session.freePeriodEndTime)
          : new Date(session.startTime.getTime() + 600000);
        if (now >= freeEnd) {
          await this.prisma.playStationSession.update({
            where: { id: session.id },
            data: {
              status: 'Running',
              billableStartTime: session.billableStartTime ?? now,
            },
          });
          session.status = 'Running';
          session.billableStartTime = session.billableStartTime ?? now;
        }
      }
    }

    const serverTime = now.toISOString();
    return sessions.map((session) => ({
      ...session,
      serverTime,
    }));
  }

  async startSession(dto: StartSessionDto, employeeId: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const device = await this.prisma.playStationDevice.findFirst({
      where: { id: dto.deviceId, cafeId },
    });
    if (!device) {
      throw new NotFoundException('الجهاز غير موجود في هذا الكافيه');
    }
    if (!device.active) {
      throw new BadRequestException('هذا الجهاز غير مفعل حالياً');
    }

    // Check if device already has active session (either Pending Free Time or Running)
    const active = await this.prisma.playStationSession.findFirst({
      where: {
        deviceId: dto.deviceId,
        status: { in: ['Pending Free Time', 'Running'] },
      },
    });
    if (active) {
      throw new BadRequestException('هذا الجهاز قيد الاستخدام حالياً في جلسة أخرى');
    }

    const startTime = new Date();
    const freePeriodEndTime = new Date(startTime.getTime() + 10 * 60 * 1000); // 10 min free

    this.logger.log(`[SESSION START] Cafe: ${cafeId} | Device: ${device.name} | Customer: ${dto.customerName} | Type: ${dto.sessionType}`);

    return this.prisma.playStationSession.create({
      data: {
        cafeId,
        deviceId: dto.deviceId,
        customerName: dto.customerName,
        sessionType: dto.sessionType,
        employeeId,
        startTime,
        freePeriodEndTime,
        status: 'Pending Free Time',
      },
      include: { device: true, openedBy: { select: { id: true, name: true } } },
    });
  }

  async getSessionTimerState(id: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: { device: true, openedBy: { select: { id: true, name: true } } },
    });
    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }

    const now = new Date();
    const serverTime = now.toISOString();
    const freePeriodEndTime = session.freePeriodEndTime
      ? new Date(session.freePeriodEndTime)
      : new Date(session.startTime.getTime() + 600000);

    const isFreePhase = now < freePeriodEndTime;

    // Remaining free time (for countdown display)
    const freeRemainingMs = isFreePhase ? Math.max(0, freePeriodEndTime.getTime() - now.getTime()) : 0;
    const freeRemainingMinutes = Math.floor(freeRemainingMs / 60000);
    const freeRemainingSeconds = Math.floor((freeRemainingMs % 60000) / 1000);

    const elapsedMs = now.getTime() - session.startTime.getTime();
    const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
    const elapsedSeconds = Math.max(0, Math.floor((elapsedMs % 60000) / 1000));

    // billableStartTime is set exactly at freePeriodEndTime if free phase is over
    let billableStartTime: string | null = null;
    let billableMs = 0;
    if (!isFreePhase) {
      if (session.billableStartTime) {
        billableStartTime = session.billableStartTime.toISOString();
        billableMs = now.getTime() - session.billableStartTime.getTime();
      } else {
        // Compute billable start as freePeriodEndTime
        billableStartTime = freePeriodEndTime.toISOString();
        billableMs = now.getTime() - freePeriodEndTime.getTime();
      }
    }

    const billableMinutes = Math.max(0, Math.floor(billableMs / 60000));
    const billableSeconds = Math.max(0, Math.floor((billableMs % 60000) / 1000));

    // Calculate live cost
    const pricing = await this.getPricing(cafeId);
    let hourlyPrice = new Prisma.Decimal(20.00);
    if (session.sessionType === 'Single Player') {
      hourlyPrice = pricing.singlePlayerHourlyPrice;
    } else if (session.sessionType === 'Two Players') {
      hourlyPrice = pricing.twoPlayersHourlyPrice;
    } else if (session.sessionType === 'Three Players') {
      hourlyPrice = pricing.threePlayersHourlyPrice;
    } else if (session.sessionType === 'Four Players') {
      hourlyPrice = pricing.fourPlayersHourlyPrice;
    }

    const ratePerMinute = hourlyPrice.div(60);
    const totalCost = billableMinutes > 0
      ? Number(ratePerMinute.mul(billableMinutes + (billableSeconds / 60)))
      : 0;

    return {
      sessionId: session.id,
      status: session.status,
      serverTime,
      startTime: session.startTime.toISOString(),
      freePeriodEndTime: freePeriodEndTime.toISOString(),
      billableStartTime,
      freeRemainingMinutes,
      freeRemainingSeconds,
      elapsedMinutes,
      elapsedSeconds,
      billableMinutes,
      billableSeconds,
      isFreePhase,
      hourlyRate: Number(hourlyPrice),
      sessionType: session.sessionType,
      totalCost: Math.round(totalCost * 100) / 100,
      deviceName: session.device?.name || 'Unknown',
      customerName: session.customerName,
      employeeName: session.openedBy?.name || 'Unknown',
    };
  }

  async closeSession(id: string, paymentStatus: string, closedById: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: { device: true },
    });
    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }
    if (session.status === 'Completed' || session.endTime) {
      throw new BadRequestException('هذه الجلسة مغلقة بالفعل');
    }

    const endTime = new Date();
    const diffMs = endTime.getTime() - session.startTime.getTime();
    const duration = Math.max(1, Math.round(diffMs / 60000)); // duration in minutes (at least 1 min)

    // Calculate cost based on hourly pricing
    const pricing = await this.getPricing(cafeId);
    let hourlyPrice = new Prisma.Decimal(20.00);

    if (session.sessionType === 'Single Player') {
      hourlyPrice = pricing.singlePlayerHourlyPrice;
    } else if (session.sessionType === 'Two Players') {
      hourlyPrice = pricing.twoPlayersHourlyPrice;
    } else if (session.sessionType === 'Three Players') {
      hourlyPrice = pricing.threePlayersHourlyPrice;
    } else if (session.sessionType === 'Four Players') {
      hourlyPrice = pricing.fourPlayersHourlyPrice;
    }

    // Cost formula: Cost = (hourly_rate / 60) * elapsed_minutes
    // FREE TIME PHASE: First 10 minutes are free. Customer is NOT charged during this period.
    let cost = new Prisma.Decimal(0.00);
    if (duration > 10) {
      const billableMinutes = duration - 10;
      const ratePerMinute = hourlyPrice.div(60);
      cost = ratePerMinute.mul(billableMinutes);
    }

    const paidAt = paymentStatus === 'PAID' ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.playStationSession.update({
        where: { id },
        data: {
          endTime,
          duration,
          cost,
          paymentStatus,
          status: 'Completed',
          closedById,
          paidAt,
        },
        include: { device: true },
      });

      if (paymentStatus === 'PAID' && Number(cost) > 0) {
        await tx.staff.update({
          where: { id: closedById },
          data: { currentCashWallet: { increment: cost } }
        });

        await tx.financialTransaction.create({
          data: {
            cafeId,
            amount: cost,
            type: 'income',
            source: 'ps',
            referenceId: updatedSession.id,
            employeeId: closedById,
          }
        });
      }

      this.logger.log(`[SESSION END] Session: ${id} | Duration: ${duration}m | Cost: ${cost} | Payment: ${paymentStatus}`);

      return updatedSession;
    });
  }

  async collectPayment(id: string, employeeId: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
    });
    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }
    if (session.paymentStatus === 'PAID') {
      throw new BadRequestException('هذه الجلسة مدفوعة بالفعل');
    }

    const cost = session.cost ? Number(session.cost) : 0;

    return this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.playStationSession.update({
        where: { id },
        data: {
          paymentStatus: 'PAID',
          paidAt: new Date(),
          closedById: employeeId,
        },
        include: { device: true },
      });

      if (cost > 0) {
        await tx.staff.update({
          where: { id: employeeId },
          data: { currentCashWallet: { increment: cost } }
        });

        await tx.financialTransaction.create({
          data: {
            cafeId,
            amount: cost,
            type: 'income',
            source: 'ps',
            referenceId: updatedSession.id,
            employeeId: employeeId,
          }
        });
      }

      this.logger.log(`[SESSION PAYMENT COLLECT] Session: ${id} | Cost: ${cost} | Collected By: ${employeeId}`);

      return updatedSession;
    });
  }

  async getSessionHistory(
    cafeId: string,
    dateFrom?: string,
    dateTo?: string,
    deviceId?: string,
    status?: string,
  ) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const where: Prisma.PlayStationSessionWhereInput = {
      cafeId,
    };

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (status) {
      where.status = status;
    } else {
      // Default to returning only completed sessions to retain compatibility
      where.status = 'Completed';
    }

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) where.startTime.lte = new Date(dateTo);
    }

    return this.prisma.playStationSession.findMany({
      where,
      include: { device: true, openedBy: { select: { id: true, name: true } } },
      orderBy: { startTime: 'desc' },
    });
  }

  async getOwnerReport(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // All completed sessions
    const allCompleted = await this.prisma.playStationSession.findMany({
      where: { cafeId, status: 'Completed', endTime: { not: null } },
      include: { device: true, openedBy: { select: { id: true, name: true } } },
    });

    // Completed today
    const todayCompleted = allCompleted.filter(s => s.endTime! >= todayStart);

    // Completed this month
    const monthCompleted = allCompleted.filter(s => s.endTime! >= monthStart);

    // Active sessions
    const activeSessions = await this.prisma.playStationSession.findMany({
      where: { cafeId, status: { in: ['Pending Free Time', 'Running'] } },
      include: { device: true, openedBy: { select: { id: true, name: true } } },
    });

    // Revenue calculations
    const totalRevenue = allCompleted.reduce((sum, s) => sum + (s.paymentStatus === 'PAID' ? Number(s.cost || 0) : 0), 0);
    const todayRevenue = todayCompleted.reduce((sum, s) => sum + (s.paymentStatus === 'PAID' ? Number(s.cost || 0) : 0), 0);
    const monthRevenue = monthCompleted.reduce((sum, s) => sum + (s.paymentStatus === 'PAID' ? Number(s.cost || 0) : 0), 0);

    // Revenue per device
    const deviceRevenueMap = new Map<string, { deviceId: string; deviceName: string; revenue: number; sessions: number }>();
    for (const s of allCompleted) {
      const did = s.deviceId;
      const existing = deviceRevenueMap.get(did);
      const revenue = s.paymentStatus === 'PAID' ? Number(s.cost || 0) : 0;
      if (existing) {
        existing.revenue += revenue;
        existing.sessions++;
      } else {
        deviceRevenueMap.set(did, { deviceId: did, deviceName: s.device?.name || 'Unknown', revenue, sessions: 1 });
      }
    }

    // Revenue per employee
    const employeeRevenueMap = new Map<string, { employeeId: string; employeeName: string; revenue: number; sessions: number }>();
    for (const s of allCompleted) {
      const eid = s.employeeId;
      const existing = employeeRevenueMap.get(eid);
      const revenue = s.paymentStatus === 'PAID' ? Number(s.cost || 0) : 0;
      if (existing) {
        existing.revenue += revenue;
        existing.sessions++;
      } else {
        employeeRevenueMap.set(eid, { employeeId: eid, employeeName: s.openedBy?.name || 'Unknown', revenue, sessions: 1 });
      }
    }

    const unpaidSessions = allCompleted.filter(s => s.paymentStatus === 'UNPAID');
    const unpaidRevenue = unpaidSessions.reduce((sum, s) => sum + Number(s.cost || 0), 0);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      monthRevenue: Math.round(monthRevenue * 100) / 100,
      revenuePerDevice: Array.from(deviceRevenueMap.values()).sort((a, b) => b.revenue - a.revenue),
      revenuePerEmployee: Array.from(employeeRevenueMap.values()).sort((a, b) => b.revenue - a.revenue),
      activeSessions: activeSessions.length,
      completedSessions: allCompleted.length,
      unpaidSessions: {
        count: unpaidSessions.length,
        totalUnpaidRevenue: Math.round(unpaidRevenue * 100) / 100,
      },
    };
  }

  async getEmployeeKpi(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const sessions = await this.prisma.playStationSession.findMany({
      where: { cafeId, endTime: { not: null } },
      include: { openedBy: { select: { id: true, name: true } } },
    });

    const map = new Map<string, {
      employeeId: string;
      employeeName: string;
      totalSessions: number;
      revenue: number;
    }>();

    for (const s of sessions) {
      const empId = s.employeeId;
      const empName = s.openedBy?.name || 'Unknown';
      const cost = s.cost ? Number(s.cost) : 0;

      const existing = map.get(empId);
      if (existing) {
        existing.totalSessions++;
        existing.revenue += cost;
      } else {
        map.set(empId, {
          employeeId: empId,
          employeeName: empName,
          totalSessions: 1,
          revenue: cost,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  async getKpiAggregations(
    cafeId: string,
    employeeId?: string,
    dateFrom?: string,
    dateTo?: string,
    deviceId?: string,
  ) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const where: Prisma.PlayStationSessionWhereInput = {
      cafeId,
      status: 'Completed',
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) where.startTime.lte = new Date(dateTo);
    }

    const sessions = await this.prisma.playStationSession.findMany({
      where,
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    const employeeMap = new Map<string, {
      employeeId: string;
      employeeName: string;
      totalSessions: number;
      revenue: number;
    }>();

    let totalDuration = 0;
    let completedCount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let paidRevenue = 0;
    let unpaidRevenue = 0;

    for (const s of sessions) {
      const empId = s.employeeId;
      const empName = s.openedBy?.name || 'Unknown';
      const cost = s.cost ? Number(s.cost) : 0;
      const duration = s.duration || 0;

      const existing = employeeMap.get(empId);
      if (existing) {
        existing.totalSessions++;
        existing.revenue += cost;
      } else {
        employeeMap.set(empId, {
          employeeId: empId,
          employeeName: empName,
          totalSessions: 1,
          revenue: cost,
        });
      }

      totalDuration += duration;
      completedCount++;

      if (s.paymentStatus === 'PAID') {
        paidCount++;
        paidRevenue += cost;
      } else {
        unpaidCount++;
        unpaidRevenue += cost;
      }
    }

    const sessionsPerEmployee = Array.from(employeeMap.values()).map(e => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      count: e.totalSessions,
    }));

    const revenuePerEmployee = Array.from(employeeMap.values()).map(e => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      revenue: e.revenue,
    }));

    const avgDuration = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;

    return {
      sessionsPerEmployee,
      revenuePerEmployee,
      averageDuration: avgDuration,
      paymentBreakdown: {
        paidCount,
        unpaidCount,
        paidRevenue,
        unpaidRevenue,
      },
    };
  }
}
