import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DomainEventBusService, DomainEventTypes } from '../domain-events';
import { AuditService } from '../audit/audit.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly domainEventBus: DomainEventBusService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(cafeId?: string) {
    const where: any = {};
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.staff.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(id: string, cafeId?: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException('Staff not found');
    if (cafeId && staff.cafeId !== cafeId) {
      throw new BadRequestException('Unauthorized branch access for this staff');
    }
    return staff;
  }

  private async generateUniqueCode(role: string): Promise<string> {
    const prefix = role === 'DRIVER' ? 'DR' : 'BR';
    for (let i = 0; i < 20; i++) {
      const digits = Math.floor(10000 + Math.random() * 90000);
      const code = `${prefix}-${digits}`;
      const existing = await this.prisma.staff.findUnique({ where: { loginCode: code } });
      if (!existing) return code;
    }
    throw new ConflictException('Unable to generate unique code');
  }

  async create(dto: CreateStaffDto, cafeId?: string, actorId?: string) {
    const existing = await this.prisma.staff.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new BadRequestException('Phone already registered');

    if (dto.loginCode) {
      const codeExists = await this.prisma.staff.findUnique({ where: { loginCode: dto.loginCode } });
      if (codeExists) throw new ConflictException('Login code already in use');
    }

    const defaultBranch = await this.prisma.branch.findFirst({
      where: { cafeId, slug: 'main-branch' },
      select: { id: true },
    });
    const branchId = defaultBranch?.id;
    if (!branchId) throw new BadRequestException('No branch found for this cafe');

    const code = dto.loginCode || await this.generateUniqueCode(dto.role);

    let passwordHash: string | undefined;
    if (dto.password) {
      const bcrypt = await import('bcrypt');
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const staff = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          name: dto.name,
          role: dto.role,
          phone: dto.phone,
          salary: dto.salary,
          salaryType: dto.salaryType,
          hourlyWage: dto.salaryType === 'HOURLY' ? dto.salary : 0,
          loginCode: code,
          password: passwordHash,
          pinHash: '',
          branchId,
          cafeId: cafeId!,
        },
      });

      await this.auditService.logTransactional(tx, {
        cafeId,
        action: 'STAFF_CREATE',
        entityType: 'Staff',
        entityId: created.id,
        actorId: actorId ?? null,
        metadata: { name: dto.name, role: dto.role, phone: dto.phone },
      });

      return created;
    });

    this.eventsService.emit('staff.created', {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      phone: staff.phone,
      loginCode: staff.loginCode,
      salary: staff.salary,
      branchId: staff.branchId,
    });

    this.domainEventBus.publish(DomainEventTypes.EMPLOYEE_CREATED, {
      staffId: staff.id,
      name: staff.name,
      role: staff.role,
      phone: staff.phone,
      cafeId: staff.cafeId,
      branchId: staff.branchId || '',
    }).catch(err => this.logger.error(`Failed to publish EMPLOYEE_CREATED: ${(err as Error).message}`));

    return staff;
  }

  async update(id: string, dto: UpdateStaffDto, cafeId?: string, actorId?: string) {
    const before = await this.findOne(id, cafeId);

    if (dto.phone) {
      const existing = await this.prisma.staff.findUnique({ where: { phone: dto.phone } });
      if (existing && existing.id !== id) throw new BadRequestException('Phone already in use');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.salary !== undefined) data.salary = dto.salary;
    if (dto.salaryType !== undefined) data.salaryType = dto.salaryType;
    if (dto.hourlyWage !== undefined) data.hourlyWage = dto.hourlyWage;
    if (dto.active !== undefined) data.active = dto.active;

    const staff = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({ where: { id }, data });

      await this.auditService.logTransactional(tx, {
        cafeId,
        action: 'STAFF_UPDATE',
        entityType: 'Staff',
        entityId: id,
        actorId: actorId ?? null,
        beforeState: {
          name: before.name,
          role: before.role,
          phone: before.phone,
          salary: before.salary,
          salaryType: before.salaryType,
          hourlyWage: before.hourlyWage,
          active: before.active,
        },
        afterState: {
          name: updated.name,
          role: updated.role,
          phone: updated.phone,
          salary: updated.salary,
          salaryType: updated.salaryType,
          hourlyWage: updated.hourlyWage,
          active: updated.active,
        },
      });

      return updated;
    });

    this.eventsService.emit('staff.updated', {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      phone: staff.phone,
      salary: staff.salary,
      active: staff.active,
    });

    return staff;
  }

  async remove(id: string, cafeId?: string, actorId?: string) {
    const staff = await this.findOne(id, cafeId);
    await this.prisma.staff.delete({ where: { id } });
    await this.auditService.log({
      cafeId,
      action: 'STAFF_DELETE',
      entityType: 'Staff',
      entityId: id,
      actorId: actorId ?? null,
      metadata: { name: staff.name, role: staff.role, phone: staff.phone },
    });
    this.eventsService.emit('staff.deleted', { id });
  }

  async resetCode(id: string, cafeId?: string) {
    const staff = await this.findOne(id, cafeId);
    const code = await this.generateUniqueCode(staff.role);
    await this.prisma.staff.update({ where: { id }, data: { loginCode: code } });
    this.eventsService.emit('staff.code-reset', { id, loginCode: code });
    return { loginCode: code };
  }

  async setPassword(id: string, password: string, cafeId?: string, actorId?: string) {
    const staff = await this.findOne(id, cafeId);
    const bcrypt = await import('bcrypt');
    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.staff.update({ where: { id }, data: { password: hashed } });
    await this.auditService.log({
      cafeId,
      action: 'STAFF_PASSWORD_CHANGE',
      entityType: 'Staff',
      entityId: id,
      actorId: actorId ?? null,
      metadata: { name: staff.name, role: staff.role },
    });
    this.eventsService.emit('staff.password-set', { id });
    return { message: 'Password set successfully' };
  }

  async getStats(id: string, cafeId?: string) {
    await this.findOne(id, cafeId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      ordersHandled,
      moneyCollected,
      performance,
      earning,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { staffId: id, cafeId },
      }),
      this.prisma.order.aggregate({
        where: { collectedById: id, cafeId },
        _sum: { amountPaid: true },
      }),
      this.prisma.staffPerformance.findUnique({
        where: { cafeId_staffId_date: { cafeId: cafeId!, staffId: id, date: today } },
      }),
      this.prisma.staffEarning.findUnique({
        where: { staffId: id },
      }),
    ]);

    return {
      ordersHandled,
      moneyCollected: moneyCollected._sum.amountPaid || 0,
      performance: performance || null,
      earning: earning || null,
    };
  }

  // ── ATTENDANCE ──

  async getAttendanceStatus(staffId: string, cafeId?: string) {
    await this.findOne(staffId, cafeId);
    
    const active = await this.prisma.attendance.findFirst({
      where: { staffId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    return { active: !!active, attendance: active };
  }

  async clockIn(staffId: string, cafeId?: string) {
    const staff = await this.findOne(staffId, cafeId);
    
    const { active } = await this.getAttendanceStatus(staffId, cafeId);
    if (active) {
      throw new BadRequestException('Staff is already clocked in');
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const attendance = await this.prisma.attendance.create({
      data: {
        cafeId: staff.cafeId,
        staffId,
        clockIn: new Date(),
        date: today,
        status: 'ACTIVE'
      }
    });

    // Create a corresponding active shift record for cash tracking
    await this.prisma.cashHandover.create({
      data: {
        cafeId: staff.cafeId,
        staffId,
        shiftStart: new Date(),
        status: 'ACTIVE',
        expectedCash: 0,
        amount: 0,
      }
    });

    this.eventsService.emit('staff.clock-in', { staffId, attendanceId: attendance.id });
    return attendance;
  }

  async clockOut(staffId: string, cafeId?: string) {
    const staff = await this.findOne(staffId, cafeId);
    
    const { active, attendance } = await this.getAttendanceStatus(staffId, cafeId);
    if (!active || !attendance) {
      throw new BadRequestException('Staff is not clocked in');
    }

    const clockOutTime = new Date();
    const diffMs = clockOutTime.getTime() - attendance.clockIn.getTime();
    const totalHours = diffMs / (1000 * 60 * 60);

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOut: clockOutTime,
        totalHours,
        status: 'COMPLETED'
      }
    });

    this.eventsService.emit('staff.clock-out', { staffId, attendanceId: updated.id, totalHours });
    return updated;
  }

  async getAllAttendance(cafeId?: string) {
    const where: any = {};
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.attendance.findMany({
      where,
      include: {
        staff: {
          select: { name: true, role: true, salaryType: true, salary: true, hourlyWage: true }
        }
      },
      orderBy: { clockIn: 'desc' }
    });
  }
}
