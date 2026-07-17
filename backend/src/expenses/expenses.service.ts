import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(data: {
    category: string;
    amount: number;
    description?: string;
    expenseDate?: Date;
    cafeId: string;
    branchId?: string;
    employeeId?: string;
  }) {
    const expense = await this.prisma.expense.create({ data: data as any });

    this.eventEmitter.emit('audit.log', {
      cafeId: data.cafeId,
      action: 'EXPENSE_CREATE',
      entityType: 'Expense',
      entityId: expense.id,
    });

    return expense;
  }

  async findAll(cafeId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { cafeId };
    if (from || to) {
      where.expenseDate = {};
      if (from) (where.expenseDate as Record<string, unknown>).gte = new Date(from);
      if (to) (where.expenseDate as Record<string, unknown>).lte = new Date(to);
    }
    return this.prisma.expense.findMany({
      where,
      include: { staff: { select: { name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
  }

  async findOne(id: string, cafeId?: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (cafeId && expense.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');
    return expense;
  }

  async getDailyExpenses(cafeId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const result = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: true,
    });

    return {
      date: start.toISOString().slice(0, 10),
      totalExpenses: Number(result._sum?.amount || 0),
      count: result._count,
    };
  }

  async getWeeklyExpenses(cafeId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const dayOfWeek = targetDate.getDay();
    const start = new Date(targetDate);
    start.setDate(targetDate.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const result = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: true,
    });

    return {
      weekStart: start.toISOString().slice(0, 10),
      weekEnd: end.toISOString().slice(0, 10),
      totalExpenses: Number(result._sum?.amount || 0),
      count: result._count,
    };
  }

  async getMonthlyExpenses(cafeId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    const result = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: true,
    });

    return {
      month: `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`,
      totalExpenses: Number(result._sum?.amount || 0),
      count: result._count,
    };
  }
}
