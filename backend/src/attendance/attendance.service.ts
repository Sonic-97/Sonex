import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto, ClockOutDto } from './dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(dto: ClockInDto, cafeId?: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: dto.staffId } });
    if (!staff) throw new NotFoundException('الموظف غير موجود');
    if (cafeId && staff.cafeId !== cafeId) throw new ForbiddenException('لا يمكن الوصول إلى هذا الموظف');

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const active = await this.prisma.attendance.findFirst({
      where: { staffId: dto.staffId, date: todayStart, status: 'ACTIVE' },
    });
    if (active) throw new BadRequestException('المستخدم في دوام بالفعل');

    return this.prisma.attendance.create({
      data: {
        staffId: dto.staffId,
        cafeId: cafeId!,
        clockIn: today,
        date: todayStart,
        status: 'ACTIVE',
      },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }

  async clockOut(dto: ClockOutDto, cafeId?: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: dto.staffId } });
    if (!staff) throw new NotFoundException('الموظف غير موجود');
    if (cafeId && staff.cafeId !== cafeId) throw new ForbiddenException('لا يمكن الوصول إلى هذا الموظف');

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const activeShift = await this.prisma.attendance.findFirst({
      where: { staffId: dto.staffId, date: todayStart, status: 'ACTIVE' },
    });
    if (!activeShift) throw new BadRequestException('لا يوجد دوام نشط');

    const clockOutTime = today;
    const msWorked = clockOutTime.getTime() - new Date(activeShift.clockIn).getTime();
    const totalHours = Math.round((msWorked / (1000 * 60 * 60)) * 100) / 100;

    return this.prisma.attendance.update({
      where: { id: activeShift.id },
      data: {
        clockOut: clockOutTime,
        totalHours,
        status: 'COMPLETED',
      },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }

  async getActiveShift(staffId: string, cafeId?: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('الموظف غير موجود');
    if (cafeId && staff.cafeId !== cafeId) throw new ForbiddenException('لا يمكن الوصول إلى هذا الموظف');

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    return this.prisma.attendance.findFirst({
      where: { staffId, date: todayStart, status: 'ACTIVE' },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }

  async getAttendanceHistory(staffId: string, cafeId?: string, from?: string, to?: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('الموظف غير موجود');
    if (cafeId && staff.cafeId !== cafeId) throw new ForbiddenException('لا يمكن الوصول إلى هذا الموظف');

    const where: Record<string, unknown> = { staffId, cafeId };
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.date = dateFilter;
    }

    return this.prisma.attendance.findMany({
      where,
      orderBy: { clockIn: 'desc' },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }

  async getAttendanceSummary(cafeId: string, from?: string, to?: string) {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const dateFrom = from ? new Date(from) : monthStart;
    const dateTo = to ? new Date(to) : today;

    const where: Record<string, unknown> = {
      cafeId,
      date: { gte: dateFrom, lte: dateTo },
      status: 'COMPLETED',
    };

    const records = await this.prisma.attendance.findMany({
      where,
      include: { staff: { select: { id: true, name: true, role: true, salary: true, salaryType: true, hourlyWage: true } } },
    });

    const grouped: Record<string, {
      staffId: string;
      staffName: string;
      role: string;
      daysWorked: number;
      totalHours: number;
      lateArrivals: number;
      dailyCost: number;
      monthlyCost: number;
    }> = {};

    for (const r of records) {
      if (!r.staff) continue;
      if (!grouped[r.staffId]) {
        grouped[r.staffId] = {
          staffId: r.staffId,
          staffName: r.staff.name,
          role: r.staff.role,
          daysWorked: 0,
          totalHours: 0,
          lateArrivals: 0,
          dailyCost: 0,
          monthlyCost: 0,
        };
      }
      grouped[r.staffId].daysWorked += 1;
      grouped[r.staffId].totalHours += Number(r.totalHours ?? 0);
      if (r.clockIn) {
        const hour = new Date(r.clockIn).getHours();
        if (hour >= 9 && hour <= 10) grouped[r.staffId].lateArrivals += 0;
        else if (hour > 10) grouped[r.staffId].lateArrivals += 1;
      }
    }

    const totalOperationalDays = new Set(
      records.map(r => r.date.toISOString().split('T')[0])
    ).size || 1;

    for (const staffId of Object.keys(grouped)) {
      const g = grouped[staffId];
      const staff = records.find(r => r.staffId === staffId)?.staff;
      if (!staff) continue;

      if (staff.salaryType === 'DAILY') {
        g.dailyCost = Number(staff.salary);
        g.monthlyCost = g.dailyCost * g.daysWorked;
      } else if (staff.salaryType === 'HOURLY') {
        const rate = Number(staff.hourlyWage ?? staff.salary);
        g.dailyCost = rate * (g.totalHours / (g.daysWorked || 1));
        g.monthlyCost = rate * g.totalHours;
      } else {
        // MONTHLY
        g.monthlyCost = Number(staff.salary);
        g.dailyCost = g.monthlyCost / (totalOperationalDays || 1);
      }
    }

    return Object.values(grouped).sort((a, b) => b.monthlyCost - a.monthlyCost);
  }

  async getAllActiveShifts(cafeId: string) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    return this.prisma.attendance.findMany({
      where: { cafeId, date: todayStart, status: 'ACTIVE' },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }
}
