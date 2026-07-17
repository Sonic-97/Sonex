import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto';

@Injectable()
export class EmployeePaymentsService {
  private readonly logger = new Logger(EmployeePaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployeePaymentDto, cafeId: string, branchId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: dto.staffId, cafeId } });
    if (!staff) throw new NotFoundException('Staff not found');

    return this.prisma.employeePayment.create({
      data: {
        cafeId,
        branchId,
        staffId: dto.staffId,
        amount: dto.amount,
        type: dto.type,
        date: new Date(dto.date),
        notes: dto.notes,
      },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }

  async findAll(cafeId: string) {
    return this.prisma.employeePayment.findMany({
      where: { cafeId },
      orderBy: { date: 'desc' },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
  }

  async findOne(id: string, cafeId: string) {
    const payment = await this.prisma.employeePayment.findFirst({
      where: { id, cafeId },
      include: { staff: { select: { id: true, name: true, role: true } } },
    });
    if (!payment) throw new NotFoundException('Employee payment not found');
    return payment;
  }

  async remove(id: string, cafeId: string) {
    const payment = await this.prisma.employeePayment.findFirst({ where: { id, cafeId } });
    if (!payment) throw new NotFoundException('Employee payment not found');
    return this.prisma.employeePayment.delete({ where: { id } });
  }

  async getReport(cafeId: string) {
    const staff = await this.prisma.staff.findMany({
      where: { cafeId, active: true },
      select: { id: true, name: true, role: true, salary: true },
    });

    const payments = await this.prisma.employeePayment.findMany({
      where: { cafeId },
      select: { staffId: true, amount: true, type: true },
    });

    const totals: Record<string, { totalSalary: number; totalAdvance: number; totalBonus: number; totalPaid: number }> = {};

    for (const p of payments) {
      if (!totals[p.staffId]) {
        totals[p.staffId] = { totalSalary: 0, totalAdvance: 0, totalBonus: 0, totalPaid: 0 };
      }
      if (p.type === 'SALARY') totals[p.staffId].totalSalary += Number(p.amount);
      else if (p.type === 'ADVANCE') totals[p.staffId].totalAdvance += Number(p.amount);
      else if (p.type === 'BONUS') totals[p.staffId].totalBonus += Number(p.amount);
      totals[p.staffId].totalPaid += Number(p.amount);
    }

    return staff.map((s) => ({
      staffId: s.id,
      name: s.name,
      role: s.role,
      salary: Number(s.salary),
      totalSalary: totals[s.id]?.totalSalary || 0,
      totalAdvance: totals[s.id]?.totalAdvance || 0,
      totalBonus: totals[s.id]?.totalBonus || 0,
      totalPaid: totals[s.id]?.totalPaid || 0,
    }));
  }
}
