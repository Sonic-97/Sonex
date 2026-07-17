import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async getTodayDashboard(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Calculate weekly start
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate monthly start
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const transactions = await this.prisma.financialTransaction.findMany({
      where: {
        cafeId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        staff: {
          select: { name: true }
        }
      }
    });

    let totalRevenue = 0;
    const sourceBreakdown = {
      pos: 0,
      ps: 0,
      other: 0,
    };
    const employeeBreakdown: Record<string, { name: string, amount: number }> = {};

    const expensesToday = await this.prisma.expense.findMany({
      where: { cafeId, expenseDate: { gte: startOfDay, lte: endOfDay } },
      include: { staff: { select: { name: true } } }
    });

    const expensesWeeklyAgg = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: startOfWeek, lte: endOfDay } },
      _sum: { amount: true }
    });

    const expensesMonthlyAgg = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: startOfMonth, lte: endOfDay } },
      _sum: { amount: true }
    });

    let totalExpenses = 0;
    const expenseEmployeeBreakdown: Record<string, { name: string, amount: number }> = {};
    const recentExpenses = expensesToday.map(ex => {
      const amt = Number(ex.amount);
      totalExpenses += amt;
      
      if (ex.employeeId && ex.staff) {
        if (!expenseEmployeeBreakdown[ex.employeeId]) {
          expenseEmployeeBreakdown[ex.employeeId] = { name: ex.staff.name, amount: 0 };
        }
        expenseEmployeeBreakdown[ex.employeeId].amount += amt;
      }

      return {
        id: ex.id,
        category: ex.category,
        description: ex.description,
        amount: amt,
        employeeName: ex.staff?.name || 'مدير النظام',
        date: ex.expenseDate
      };
    });

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      totalRevenue += amount;

      if (tx.source === 'pos') {
        sourceBreakdown.pos += amount;
      } else if (tx.source === 'ps') {
        sourceBreakdown.ps += amount;
      } else {
        sourceBreakdown.other += amount;
      }

      if (tx.employeeId && tx.staff) {
        if (!employeeBreakdown[tx.employeeId]) {
          employeeBreakdown[tx.employeeId] = { name: tx.staff.name, amount: 0 };
        }
        employeeBreakdown[tx.employeeId].amount += amount;
      }
    }

    const monthTransactions = await this.prisma.financialTransaction.aggregate({
      where: { cafeId, createdAt: { gte: startOfMonth, lte: endOfDay }, type: 'income' },
      _sum: { amount: true },
    });

    const monthOrdersRev = await this.prisma.order.aggregate({
      where: { cafeId, createdAt: { gte: startOfMonth, lte: endOfDay }, paymentStatus: 'PAID' },
      _sum: { total: true },
    });
    const monthInCafeRev = await this.prisma.inCafeOrder.aggregate({
      where: { cafeId, createdAt: { gte: startOfMonth, lte: endOfDay }, paymentStatus: 'PAID' },
      _sum: { total: true },
    });
    const monthRevenue =
      Number(monthOrdersRev._sum.total || 0) + Number(monthInCafeRev._sum.total || 0);

    return {
      totalRevenue,
      totalExpenses,
      profit: totalRevenue - totalExpenses,
      weeklyExpenses: Number(expensesWeeklyAgg._sum.amount || 0),
      monthlyExpenses: Number(expensesMonthlyAgg._sum.amount || 0),
      monthRevenue,
      sourceBreakdown,
      employeeBreakdown: Object.values(employeeBreakdown).sort((a, b) => b.amount - a.amount),
      expenseEmployeeBreakdown: Object.values(expenseEmployeeBreakdown).sort((a, b) => b.amount - a.amount),
      recentExpenses,
    };
  }
}
