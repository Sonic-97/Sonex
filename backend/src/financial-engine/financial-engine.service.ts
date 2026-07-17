import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DomainEventBusService, DomainEventTypes } from '../domain-events';
import { AuditService } from '../audit/audit.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import {
  ProcessPaymentInput,
  ProcessRefundInput,
  SettleDebtInput,
  ProfitBreakdown,
  UnifiedDebtOverview,
  PaymentResult,
  RefundResult,
  OrderSource,
  TransactionType,
} from './dto/financial-engine.dto';
import { PrismaClient } from '@prisma/client';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class FinancialEngineService {
  private readonly logger = new Logger(FinancialEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly domainEventBus: DomainEventBusService,
    private readonly auditService: AuditService,
    private readonly inventoryPipeline: InventoryPipelineService,
  ) {}

  async processPaymentInTx(tx: Tx, input: ProcessPaymentInput): Promise<PaymentResult> {
    const newlyPaidAmount = input.collectedAmount - input.previousAmountPaid;
    if (newlyPaidAmount <= 0) {
      return this.buildPaymentResult(input, input.previousAmountPaid, input.total - input.previousAmountPaid);
    }

    const remainingAmount = Math.max(0, input.total - input.collectedAmount);

    await this.createPaymentLog(tx, input, newlyPaidAmount);
    await this.createFinancialTransactionForPayment(tx, input, newlyPaidAmount);
    await this.updateCashWallet(tx, input, newlyPaidAmount);
    await this.updateCustomerOnPayment(tx, input);
    await this.handleDebtOnPayment(tx, input, remainingAmount);

    return this.buildPaymentResult(input, input.collectedAmount, remainingAmount);
  }

  async processPayment(input: ProcessPaymentInput): Promise<PaymentResult> {
    const newlyPaidAmount = input.collectedAmount - input.previousAmountPaid;
    if (newlyPaidAmount <= 0) {
      return this.buildPaymentResult(input, input.previousAmountPaid, input.total - input.previousAmountPaid);
    }

    const remainingAmount = Math.max(0, input.total - input.collectedAmount);

    await this.prisma.$transaction(async (tx) => {
      await this.createPaymentLog(tx, input, newlyPaidAmount);
      await this.createFinancialTransactionForPayment(tx, input, newlyPaidAmount);
      await this.updateCashWallet(tx, input, newlyPaidAmount);
      await this.updateCustomerOnPayment(tx, input);
      await this.handleDebtOnPayment(tx, input, remainingAmount);
    });

    this.emitPaymentEvents(input, newlyPaidAmount, remainingAmount);

    return this.buildPaymentResult(input, input.collectedAmount, remainingAmount);
  }

  async processRefund(dto: ProcessRefundInput): Promise<RefundResult> {
    const order = await this.prisma.unifiedOrder.findUnique({
      where: { id: dto.orderId },
      select: { cafeId: true, paymentStatus: true, amountPaid: true, grandTotal: true, branchId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.cafeId !== dto.cafeId) throw new ForbiddenException('Unauthorized access');
    if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_PAID') {
      throw new BadRequestException('Cannot refund an unpaid order');
    }
    if (dto.refundAmount > Number(order.amountPaid)) {
      throw new BadRequestException('Refund amount exceeds amount paid');
    }

    const newAmountPaid = Number(order.amountPaid) - dto.refundAmount;
    const newPaymentStatus = newAmountPaid <= 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const refund = await this.prisma.$transaction(async (tx) => {
      const created = await tx.unifiedRefund.create({
        data: {
          cafeId: dto.cafeId,
          orderId: dto.orderId,
          amount: new Prisma.Decimal(dto.refundAmount),
          reason: dto.reason,
          itemIds: dto.itemIds ?? Prisma.JsonNull,
          paymentsRefunded: Prisma.JsonNull,
          processedById: dto.processedById ?? null,
        },
      });

      await tx.financialTransaction.create({
        data: {
          cafeId: dto.cafeId,
          amount: new Prisma.Decimal(-dto.refundAmount),
          type: TransactionType.REFUND,
          source: OrderSource.REFUND,
          referenceId: dto.orderId,
          employeeId: dto.processedById ?? null,
          metadata: { refundId: created.id, reason: dto.reason },
        },
      });

      let inventoryRestored = false;
      if (dto.restoreInventory) {
        await this.inventoryPipeline.release(dto.orderId, tx);
        inventoryRestored = true;
      }

      return { created, inventoryRestored };
    });

    this.eventsService.emit('order.refunded', {
      orderId: dto.orderId,
      refundId: refund.created.id,
      amount: dto.refundAmount,
      reason: dto.reason,
      processedById: dto.processedById,
    });

    this.domainEventBus.publish(DomainEventTypes.ORDER_REFUNDED, {
      orderId: dto.orderId,
      orderCode: '',
      cafeId: dto.cafeId,
      branchId: order.branchId || '',
      amount: dto.refundAmount,
      reason: dto.reason,
      refundedById: dto.processedById || '',
    }).catch(err => this.logger.error(`Failed to publish ORDER_REFUNDED: ${(err as Error).message}`));

    return {
      refundId: refund.created.id,
      newAmountPaid,
      newPaymentStatus,
      inventoryRestored: refund.inventoryRestored,
    };
  }

  async settleDebt(dto: SettleDebtInput): Promise<any> {
    const debt = await this.prisma.debt.findUnique({ where: { id: dto.debtId } });
    if (!debt) throw new NotFoundException('Debt not found');
    if (dto.cafeId && debt.cafeId !== dto.cafeId) throw new ForbiddenException('Unauthorized access');

    const settleAmount = dto.settleAmount ?? Number(debt.amount);

    const settled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.debt.update({
        where: { id: dto.debtId },
        data: { settled: true, settledAt: new Date(), settledById: dto.settledById },
      });

      await tx.customer.update({
        where: { id: debt.customerId },
        data: { unpaidBalance: { decrement: settleAmount } },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: dto.cafeId ?? debt.cafeId,
        action: 'DEBT_SETTLE',
        entityType: 'Debt',
        entityId: dto.debtId,
        actorId: dto.settledById,
        actorRole: null,
        beforeState: { settled: false, amount: Number(debt.amount) },
        afterState: { settled: true, settledById: dto.settledById },
        metadata: { customerId: debt.customerId, settleAmount },
      });

      return updated;
    });

    this.eventsService.emit('debt.settled', { debtId: dto.debtId, settledById: dto.settledById, amount: settleAmount });

    this.domainEventBus.publish(DomainEventTypes.DEBT_PAID, {
      debtId: dto.debtId,
      orderId: debt.orderId || '',
      orderCode: '',
      cafeId: debt.cafeId,
      branchId: debt.branchId || '',
      customerName: '',
      amount: settleAmount,
      paidById: dto.settledById || '',
      paidAt: new Date().toISOString(),
    }).catch(err => this.logger.error(`Failed to publish DEBT_PAID: ${(err as Error).message}`));

    return settled;
  }

  async getUnifiedDebtOverview(cafeId: string): Promise<UnifiedDebtOverview> {
    const [debts, inCafeOrders, orders] = await Promise.all([
      this.prisma.debt.findMany({ where: { cafeId, settled: false }, include: { customer: true } }),
      this.prisma.inCafeOrder.findMany({ where: { cafeId, paymentStatus: 'UNPAID' }, include: { items: true, customer: true } }),
      this.prisma.order.findMany({ where: { cafeId, paid: false }, include: { customer: true } }),
    ]);

    const customerMap = new Map<string, UnifiedDebtOverview['customers'][0]>();

    for (const d of debts) {
      if (!d.customerId) continue;
      const c = customerMap.get(d.customerId) || { name: d.customer?.name || 'Unknown', phone: d.customer?.phone, totalDebt: 0, orders: [] };
      c.totalDebt += Number(d.amount);
      c.orders.push({ type: 'debt', id: d.id, amount: Number(d.amount), createdAt: d.createdAt });
      customerMap.set(d.customerId, c);
    }

    for (const o of inCafeOrders) {
      if (!o.customerId) continue;
      const c = customerMap.get(o.customerId) || { name: o.customer?.name || 'Unknown', phone: o.customer?.phone, totalDebt: 0, orders: [] };
      const unpaid = Number(o.total) - Number(o.paidAmount || 0);
      if (unpaid <= 0) continue;
      c.totalDebt += unpaid;
      c.orders.push({ type: 'in_cafe', id: o.id, amount: unpaid, createdAt: o.createdAt });
      customerMap.set(o.customerId, c);
    }

    for (const o of orders) {
      if (!o.customerId) continue;
      const c = customerMap.get(o.customerId) || { name: o.customer?.name || 'Unknown', phone: o.customer?.phone, totalDebt: 0, orders: [] };
      const unpaid = Number(o.total) - Number(o.amountPaid || 0);
      if (unpaid <= 0) continue;
      c.totalDebt += unpaid;
      c.orders.push({ type: 'delivery', id: o.id, amount: unpaid, createdAt: o.createdAt });
      customerMap.set(o.customerId, c);
    }

    const customers = Array.from(customerMap.values()).sort((a, b) => b.totalDebt - a.totalDebt);
    const totalOutstanding = customers.reduce((s, c) => s + c.totalDebt, 0);
    return { customers, totalOutstanding, customerCount: customers.length };
  }

  async calculateProductProfitability(
    productId: string,
    cafeId: string,
    from?: Date,
    to?: Date,
  ): Promise<ProfitBreakdown> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.cafeId !== cafeId) throw new NotFoundException('Product not found');

    const dateFrom = from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = to ?? new Date();

    const recipe = await this.prisma.recipeIngredient.findMany({
      where: { productId },
      include: { inventory: { select: { costPerUnit: true, unit: true, itemName: true } } },
    });
    const ingredientCost = recipe.reduce((sum, r) => sum + Number(r.quantity) * Number(r.inventory.costPerUnit), 0);

    const totalOrders = await this.prisma.order.count({
      where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo } },
    });

    const staffAttendances = await this.prisma.attendance.findMany({
      where: { cafeId, date: { gte: dateFrom, lte: dateTo }, status: 'COMPLETED' },
      include: { staff: { select: { salary: true, salaryType: true, hourlyWage: true } } },
    });

    const totalLaborCost = staffAttendances.reduce((sum, a) => {
      if (!a.staff) return sum;
      const hours = Number(a.totalHours ?? 0);
      if (a.staff.salaryType === 'HOURLY') return sum + hours * Number(a.staff.hourlyWage ?? a.staff.salary);
      if (a.staff.salaryType === 'DAILY') return sum + Number(a.staff.salary);
      const daysInMonth = new Date(a.date.getFullYear(), a.date.getMonth() + 1, 0).getDate();
      return sum + Number(a.staff.salary) / daysInMonth;
    }, 0);

    const totalItemsSold = await this.prisma.orderItem.count({
      where: { product: { cafeId }, order: { createdAt: { gte: dateFrom, lte: dateTo } } },
    });

    const productOrderCount = await this.prisma.orderItem.count({
      where: { productId, order: { createdAt: { gte: dateFrom, lte: dateTo } } },
    });

    const laborCostPerProduct = totalOrders > 0 && totalItemsSold > 0
      ? (totalLaborCost / totalOrders) * (productOrderCount / (totalItemsSold || 1))
      : 0;

    const totalExpenses = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: dateFrom, lte: dateTo } },
      _sum: { amount: true },
    });
    const totalOperationalExpenses = Number(totalExpenses._sum.amount ?? 0);
    const operationalCostPerProduct = totalItemsSold > 0 ? (totalOperationalExpenses * 0.5) / totalItemsSold : 0;

    const utilityExpenses = await this.prisma.expense.aggregate({
      where: { cafeId, category: { in: ['كهرباء', 'مياه', 'غاز', 'Utilities', 'utility'] }, expenseDate: { gte: dateFrom, lte: dateTo } },
      _sum: { amount: true },
    });
    const totalUtilityCost = Number(utilityExpenses._sum.amount ?? 0);
    const utilityCostPerProduct = totalItemsSold > 0 ? totalUtilityCost / totalItemsSold : 0;

    const totalMiscExpenses = totalOperationalExpenses * 0.5;
    const miscCostPerProduct = totalItemsSold > 0 ? totalMiscExpenses / totalItemsSold : 0;

    const estimatedCost = ingredientCost + laborCostPerProduct + operationalCostPerProduct + utilityCostPerProduct + miscCostPerProduct;
    const sellingPrice = Number(product.price ?? 0);
    const estimatedProfit = sellingPrice - estimatedCost;
    const profitMargin = sellingPrice > 0 ? (estimatedProfit / sellingPrice) * 100 : 0;

    return {
      productId,
      productName: product.name ?? '',
      sellingPrice,
      ingredientCost: Math.round(ingredientCost * 100) / 100,
      laborCost: Math.round(laborCostPerProduct * 100) / 100,
      operationalCost: Math.round(operationalCostPerProduct * 100) / 100,
      utilityCost: Math.round(utilityCostPerProduct * 100) / 100,
      miscellaneousCost: Math.round(miscCostPerProduct * 100) / 100,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      estimatedProfit: Math.round(estimatedProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      orderCount: productOrderCount,
      totalItemsSold,
      dateRange: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    };
  }

  async getProductProfitabilityRanking(cafeId: string, from?: string, to?: string) {
    const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = to ? new Date(to) : new Date();
    const products = await this.prisma.product.findMany({ where: { cafeId, active: true } });
    const breakdowns = await Promise.all(
      products.map(p => this.calculateProductProfitability(p.id, cafeId, dateFrom, dateTo)),
    );
    const sortedByMargin = [...breakdowns].sort((a, b) => b.profitMargin - a.profitMargin);
    const sortedByProfit = [...breakdowns].sort((a, b) => b.estimatedProfit - a.estimatedProfit);
    return {
      products: breakdowns,
      mostProfitableByMargin: sortedByMargin.slice(0, 10),
      mostProfitableByProfit: sortedByProfit.slice(0, 10),
      leastProfitableByMargin: sortedByMargin.slice(-10).reverse(),
      leastProfitableByProfit: sortedByProfit.slice(-10).reverse(),
    };
  }

  async getSalesSummary(cafeId: string, from?: string, to?: string) {
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const dateTo = to ? new Date(to) : new Date();

    const [orderRevenue, inCafeRevenue, orderCount, inCafeCount] = await Promise.all([
      this.prisma.order.aggregate({ where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo }, paymentStatus: 'PAID' }, _sum: { total: true } }),
      this.prisma.inCafeOrder.aggregate({ where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo }, paymentStatus: 'PAID' }, _sum: { total: true } }),
      this.prisma.order.count({ where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo }, paymentStatus: 'PAID' } }),
      this.prisma.inCafeOrder.count({ where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo }, paymentStatus: 'PAID' } }),
    ]);

    const totalRevenue = Number(orderRevenue._sum.total || 0) + Number(inCafeRevenue._sum.total || 0);
    const totalOrders = orderCount + inCafeCount;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    };
  }

  async getProfitSummary(cafeId: string, from?: string, to?: string) {
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const dateTo = to ? new Date(to) : new Date();

    const [orderProfit, inCafeProfit, expenses] = await Promise.all([
      this.prisma.order.aggregate({
        where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo }, paymentStatus: 'PAID' },
        _sum: { total: true, profit: true },
      }),
      this.prisma.inCafeOrder.aggregate({
        where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo }, paymentStatus: 'PAID' },
        _sum: { total: true, totalCost: true },
      }),
      this.prisma.expense.aggregate({
        where: { cafeId, expenseDate: { gte: dateFrom, lte: dateTo } },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(orderProfit._sum.total || 0) + Number(inCafeProfit._sum.total || 0);
    const deliveryProfit = Number(orderProfit._sum.profit || 0);
    const inCafeGross = Number(inCafeProfit._sum.total || 0) - Number(inCafeProfit._sum.totalCost || 0);
    const grossProfit = deliveryProfit + inCafeGross;
    const totalExpenses = Number(expenses._sum.amount ?? 0);
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      totalRevenue: Math.round(revenue * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
    };
  }

  async createDailyRevenueSnapshot(cafeId: string): Promise<void> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [daily, orderAgg, inCafeAgg] = await Promise.all([
      this.prisma.dailyRevenue.findFirst({ where: { cafeId, date: todayStart } }),
      this.prisma.order.aggregate({
        where: { cafeId, createdAt: { gte: todayStart }, isRevenueConfirmed: true },
        _sum: { total: true, profit: true },
        _count: true,
      }),
      this.prisma.inCafeOrder.aggregate({
        where: { cafeId, createdAt: { gte: todayStart }, paymentStatus: 'PAID' },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const totalRevenue = Number(orderAgg._sum.total || 0) + Number(inCafeAgg._sum.total || 0);
    const totalProfit = Number(orderAgg._sum.profit || 0);
    const totalOrders = (orderAgg._count || 0) + (inCafeAgg._count || 0);

    if (daily) {
      await this.prisma.dailyRevenue.update({
        where: { id: daily.id },
        data: {
          totalRevenue: new Prisma.Decimal(totalRevenue),
          totalProfit: new Prisma.Decimal(totalProfit),
          totalOrders,
        },
      });
    } else {
      await this.prisma.dailyRevenue.create({
        data: {
          cafeId,
          date: todayStart,
          totalRevenue: new Prisma.Decimal(totalRevenue),
          totalProfit: new Prisma.Decimal(totalProfit),
          totalOrders,
        } as any,
      });
    }
  }

  async confirmRevenueInTx(tx: Tx, cafeId: string, totalRevenue: number, profit: number): Promise<void> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const daily = await tx.dailyRevenue.findFirst({
      where: { cafeId, date: todayStart },
    });

    if (daily) {
      await tx.dailyRevenue.update({
        where: { id: daily.id },
        data: {
          totalRevenue: new Prisma.Decimal(Number(daily.totalRevenue) + totalRevenue),
          totalProfit: new Prisma.Decimal(Number(daily.totalProfit) + profit),
          totalOrders: daily.totalOrders + 1,
        },
      });
    } else {
      await tx.dailyRevenue.create({
        data: {
          cafeId,
          date: todayStart,
          totalRevenue: new Prisma.Decimal(totalRevenue),
          totalProfit: new Prisma.Decimal(profit),
          totalOrders: 1,
        } as any,
      });
    }
  }

  async confirmRevenue(orderId: string, cafeId: string, totalRevenue: number, profit: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.confirmRevenueInTx(tx, cafeId, totalRevenue, profit);
    });
  }

  async rollbackRevenueInTx(tx: Tx, cafeId: string, totalRevenue: number): Promise<void> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const daily = await tx.dailyRevenue.findFirst({
      where: { cafeId, date: todayStart },
    });

    if (daily && daily.totalOrders > 0) {
      await tx.dailyRevenue.update({
        where: { id: daily.id },
        data: {
          totalRevenue: new Prisma.Decimal(Math.max(0, Number(daily.totalRevenue) - totalRevenue)),
          totalOrders: Math.max(0, daily.totalOrders - 1),
        },
      });
    }
  }

  async rollbackRevenue(orderId: string, cafeId: string, totalRevenue: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.rollbackRevenueInTx(tx, cafeId, totalRevenue);
    });
  }

  async createPaymentLog(tx: Tx, input: ProcessPaymentInput, newlyPaidAmount: number): Promise<void> {
    await tx.paymentLog.create({
      data: {
        cafeId: input.cafeId,
        branchId: input.branchId,
        orderId: input.orderId,
        previousStatus: input.previousPaymentStatus,
        newStatus: input.paymentStatus,
        amount: new Prisma.Decimal(newlyPaidAmount),
        method: input.paymentMethod || null,
        collectedById: input.collectedById || null,
        collectedRole: input.collectedRole || null,
        notes: input.notes || null,
      } as any,
    });
  }

  async createFinancialTransaction(
    tx: Tx,
    cafeId: string,
    amount: number,
    source: string,
    referenceId: string,
    employeeId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await tx.financialTransaction.create({
      data: {
        cafeId,
        amount: new Prisma.Decimal(amount),
        type: TransactionType.INCOME,
        source,
        referenceId,
        employeeId: employeeId || null,
        metadata: metadata || {},
      },
    });
  }

  async createFinancialTransactionForPayment(tx: Tx, input: ProcessPaymentInput, newlyPaidAmount: number): Promise<void> {
    await this.createFinancialTransaction(
      tx,
      input.cafeId,
      newlyPaidAmount,
      input.splitPayments?.length ? OrderSource.POS_SPLIT : OrderSource.POS,
      input.orderId,
      input.collectedById,
      {
        method: input.paymentMethod || 'CASH',
        orderCode: input.orderCode,
        orderType: input.orderType,
        splitCount: input.splitPayments?.length || 0,
      },
    );

    if (input.splitPayments?.length) {
      for (const split of input.splitPayments) {
        await this.createFinancialTransaction(
          tx,
          input.cafeId,
          split.amount,
          OrderSource.POS_SPLIT,
          input.orderId,
          input.collectedById,
          { method: split.method, orderCode: input.orderCode, isSplit: true },
        );
      }
    }
  }

  async updateCashWallet(tx: Tx, input: ProcessPaymentInput, newlyPaidAmount: number): Promise<boolean> {
    const method = input.paymentMethod || 'CASH';
    if (method === 'CASH' && input.collectedRole === 'BARISTA' && input.collectedById) {
      await tx.staff.update({
        where: { id: input.collectedById },
        data: { currentCashWallet: { increment: new Prisma.Decimal(newlyPaidAmount) } },
      });
      return true;
    }
    return false;
  }

  async updateCustomerOnPayment(tx: Tx, input: ProcessPaymentInput): Promise<boolean> {
    if (!input.customerId) return false;

    if (input.paymentStatus === 'PAID') {
      const delta = input.total - input.collectedAmount;
      if (delta > 0) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: { unpaidBalance: { decrement: delta } },
        });
        return true;
      }
    }
    return false;
  }

  async handleDebtOnPayment(tx: Tx, input: ProcessPaymentInput, remainingAmount: number): Promise<boolean> {
    if (remainingAmount > 0 && input.customerId) {
      await tx.debt.create({
        data: {
          cafeId: input.cafeId,
          branchId: input.branchId,
          customerId: input.customerId,
          orderId: input.orderId,
          amount: new Prisma.Decimal(remainingAmount),
          reason: input.paymentStatus === 'PARTIAL_PAYMENT' ? 'Partial payment' : 'Unpaid balance',
          collectedByRole: input.collectedRole || null,
        } as any,
      });
      return true;
    }
    return false;
  }

  emitPaymentEvents(input: ProcessPaymentInput, newlyPaidAmount: number, remainingAmount?: number): void {
    const remaining = remainingAmount ?? Math.max(0, input.total - input.collectedAmount);

    this.eventsService.emit('payment.updated', {
      orderId: input.orderId,
      orderCode: input.orderCode,
      paymentStatus: input.paymentStatus,
      amountPaid: input.collectedAmount,
      remainingAmount: remaining,
      collectedById: input.collectedById,
      collectedRole: input.collectedRole,
    });

    if (input.paymentStatus === 'PAID') {
      this.eventsService.emit('payment.collected', {
        orderId: input.orderId,
        orderCode: input.orderCode,
        amount: newlyPaidAmount,
        collectedById: input.collectedById,
        collectedRole: input.collectedRole,
      });
    } else {
      this.eventsService.emit('payment.pending', {
        orderId: input.orderId,
        orderCode: input.orderCode,
        remainingAmount: remaining,
        collectedRole: input.collectedRole,
      });
    }

    this.domainEventBus.publish(DomainEventTypes.PAYMENT_COMPLETED, {
      orderId: input.orderId,
      orderCode: input.orderCode || '',
      cafeId: input.cafeId,
      branchId: input.branchId || '',
      amount: newlyPaidAmount,
      method: input.paymentMethod || 'CASH',
      paymentStatus: input.paymentStatus,
      remainingAmount: remaining,
      collectedById: input.collectedById || '',
      collectedByRole: input.collectedRole || 'OWNER',
      isDelivery: input.orderType === 'DELIVERY',
    }).catch(err => this.logger.error(`Failed to publish PAYMENT_COMPLETED: ${(err as Error).message}`));

    if (remaining > 0 && input.paymentStatus !== 'PAID') {
      this.domainEventBus.publish(DomainEventTypes.DEBT_CREATED, {
        orderId: input.orderId,
        orderCode: input.orderCode || '',
        cafeId: input.cafeId,
        branchId: input.branchId || '',
        customerName: input.customerName || '',
        customerPhone: input.customerPhone,
        amount: remaining,
        source: input.orderType === 'DELIVERY' ? 'DELIVERY' : 'IN_CAFE',
      }).catch(err => this.logger.error(`Failed to publish DEBT_CREATED: ${(err as Error).message}`));
    }
  }

  private buildPaymentResult(input: ProcessPaymentInput, amountPaid: number, remainingAmount: number): PaymentResult {
    return {
      orderId: input.orderId,
      paymentStatus: input.paymentStatus,
      amountPaid,
      remainingAmount,
      cashWalletUpdated: false,
      debtCreated: false,
      customerUpdated: false,
    };
  }
}
