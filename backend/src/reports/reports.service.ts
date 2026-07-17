import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfExportService } from './export/pdf-export.service';
import { ExcelExportService } from './export/excel-export.service';
import { QueueService } from '../queue/queue.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfExport: PdfExportService,
    private readonly excelExport: ExcelExportService,
    private readonly queueService: QueueService,
    private readonly analytics: AnalyticsService,
    private readonly engine: AnalyticsEngineService,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  async generateReport(type: string, filters: Record<string, unknown>, userId: string, roleTarget: string = 'Cafe') {
    if (filters.dateRange) {
      const dr = filters.dateRange as { from?: string; to?: string };
      if (dr.from && dr.to) {
        const from = new Date(dr.from);
        const to = new Date(dr.to);
        const diffDays = (to.getTime() - from.getTime()) / 86400000;
        if (diffDays > 365) throw new BadRequestException('Date range cannot exceed 1 year');
      }
    }

    const user = await this.prisma.staff.findUnique({ where: { id: userId }, select: { cafeId: true } });
    const reportJob = await this.prisma.reportJob.create({
      data: { cafeId: user?.cafeId ?? '', type, status: 'pending', userId, filters: filters as any } as any,
    });

    await this.queueService.addReportsJob('generate-report', {
      reportJobId: reportJob.id,
      type,
      filters,
      userId,
      roleTarget,
    });

    return { jobId: reportJob.id, status: 'pending' };
  }

  async getReportStatus(jobId: string, userId: string, cafeId?: string) {
    const where: any = { id: jobId };
    if (cafeId) where.cafeId = cafeId;
    const job = await this.prisma.reportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Report job not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (cafeId && job.cafeId !== cafeId) throw new ForbiddenException('Access denied');

    const progress = job.status === 'completed' ? 100 : job.status === 'processing' ? 50 : job.status === 'failed' ? 0 : 10;
    return { jobId: job.id, status: job.status, percentComplete: progress, fileUrl: job.fileUrl, errorMsg: job.errorMsg };
  }

  async getAvailableReports(userId: string, role: string, cafeId?: string) {
    const all = [
      { type: 'SALES', name: 'Sales Report', description: 'Revenue, orders, average order value over time', roles: ['Cafe'] },
      { type: 'ORDERS', name: 'Orders Report', description: 'Order statistics, status distribution, processing times', roles: ['Cafe', 'BARISTA'] },
      { type: 'PROFIT', name: 'Profit Report', description: 'Revenue vs cost analysis, profit margins', roles: ['Cafe'] },
      { type: 'INVENTORY', name: 'Inventory Report', description: 'Stock levels, usage trends, low stock alerts', roles: ['Cafe', 'BARISTA'] },
      { type: 'EMPLOYEE_PERFORMANCE', name: 'Employee Performance Report', description: 'Employee metrics, efficiency scores', roles: ['Cafe'] },
    ];
    return all.filter((r) => r.roles.includes(role));
  }

  async getReportList(userId: string, page: number = 1, limit: number = 20, cafeId?: string) {
    const where: any = { userId };
    if (cafeId) where.cafeId = cafeId;
    const [data, total] = await Promise.all([
      this.prisma.reportJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.reportJob.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async deleteReport(reportId: string, userId: string, cafeId?: string) {
    const report = await this.prisma.reportJob.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.userId !== userId) throw new ForbiddenException('Access denied');
    if (cafeId && report.cafeId !== cafeId) throw new ForbiddenException('Access denied');

    if (report.fileUrl) {
      try {
        const fs = require('fs');
        fs.unlinkSync(report.fileUrl);
      } catch { /* file may not exist */ }
    }
    await this.prisma.reportJob.delete({ where: { id: reportId } });
    return { success: true };
  }

  async completeReportJob(reportJobId: string, fileUrl: string) {
    await this.prisma.reportJob.update({
      where: { id: reportJobId },
      data: { status: 'completed', fileUrl, completedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
  }

  async failReportJob(reportJobId: string, errorMsg: string) {
    await this.prisma.reportJob.update({
      where: { id: reportJobId },
      data: { status: 'failed', errorMsg },
    });
  }

  async getReportDownload(jobId: string, userId: string, cafeId?: string) {
    const job = await this.prisma.reportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Report not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (cafeId && job.cafeId !== cafeId) throw new ForbiddenException('Access denied');
    if (job.status !== 'completed' || !job.fileUrl) throw new BadRequestException('Report not ready');
    return job;
  }

  async generateDailyReport(cafeId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const from = todayStart.toISOString();
    const to = todayEnd.toISOString();

    const [summary, topProducts] = await Promise.all([
      this.financialEngine.getSalesSummary(cafeId, from, to),
      this.engine.topProductsByQuantity(cafeId, 5, from, to),
    ]);

    return {
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      topSellingItems: topProducts.map((p) => ({ name: p.name, qty: p.quantity })),
    };
  }

  async generateReportFile(type: string, filters: Record<string, unknown>, jobId: string, format: string = 'PDF') {
    const data = await this.fetchReportData(type, filters);
    const metrics = await this.calculateMetrics(type, data);
    if (format === 'EXCEL') {
      return this.excelExport.generateReport(type, metrics, data.rows || [], filters, jobId);
    }
    return this.pdfExport.generateReport(type, metrics, filters, jobId);
  }

  private async fetchReportData(type: string, filters: Record<string, unknown>) {
    const dateFilter = filters.dateRange as { from?: string; to?: string } | undefined;
    const from = dateFilter?.from ? new Date(dateFilter.from) : new Date(Date.now() - 30 * 86400000);
    const to = dateFilter?.to ? new Date(dateFilter.to) : new Date();
    const groupBy = (filters.groupBy as string) || 'DAILY';
    const category = filters.category as string | undefined;
    const status = filters.status as string | undefined;
    const employee = filters.employee as string | undefined;
    const employeeRole = filters.employeeRole as string | undefined;
    const branchId = filters.branchId as string | undefined;
    const cafeId = filters.cafeId as string | undefined;

    const cafeOrderFilter = cafeId ? Prisma.sql`AND o.cafe_id = ${cafeId}` : Prisma.empty;
    const cafeOrderAggFilter = cafeId ? { cafeId } : {};
    const cafeInCafeAggFilter = cafeId ? { cafeId } : {};

    switch (type) {
      case 'SALES': {
        const trend = await this.engine.getSalesTrend(groupBy, 'custom', from.toISOString(), to.toISOString(), branchId, cafeId);
        const summary = await this.financialEngine.getSalesSummary(cafeId!, from.toISOString(), to.toISOString());
        const topProducts = await this.engine.topProductsByRevenue(cafeId!, 10, from.toISOString(), to.toISOString());

        return {
          rows: trend.map((t) => ({
            period: t.period.toISOString(),
            orders: t.orders,
            revenue: t.revenue,
            avg_order: t.orders > 0 ? t.revenue / t.orders : 0,
          })) as Record<string, unknown>[],
          metrics: {
            totalRevenue: summary.totalRevenue,
            totalOrders: summary.totalOrders,
            avgOrderValue: summary.avgOrderValue,
            topProducts: topProducts.map((p) => ({ name: p.name, units: p.quantity, revenue: p.revenue })),
          },
        };
      }
      case 'ORDERS': {
        const unifiedWhere: Prisma.UnifiedOrderWhereInput = { createdAt: { gte: from, lte: to } };
        if (cafeId) unifiedWhere.cafeId = cafeId;
        if (status) unifiedWhere.status = status;
        if (branchId) unifiedWhere.branchId = branchId;

        const [totalOrders, cancelledCount, peakHours, topOrdersList] = await Promise.all([
          this.prisma.unifiedOrder.count({ where: unifiedWhere }),
          this.prisma.unifiedOrder.count({ where: { ...unifiedWhere, status: 'CANCELLED' } }),
          this.engine.getPeakHours(branchId, cafeId),
          this.prisma.unifiedOrder.findMany({
            where: unifiedWhere, orderBy: { grandTotal: 'desc' }, take: 20,
            select: { id: true, code: true, status: true, grandTotal: true, paymentStatus: true, customerName: true, customerPhone: true, createdAt: true },
          }),
        ]);

        const cancellationRate = totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : 0;
        const statuses = await this.engine.getOrderDistribution(branchId, cafeId);

        const topRows = topOrdersList.map((o) => ({
          id: o.id, code: o.code, status: o.status, total: Number(o.grandTotal),
          paymentStatus: o.paymentStatus, customer: o.customerName || o.customerPhone || '', createdAt: o.createdAt, source: 'unified',
        }));

        return {
          rows: topRows,
          metrics: {
            totalOrders,
            cancelledCount,
            cancellationRate: Math.round(cancellationRate * 100) / 100,
            statusBreakdown: statuses,
            peakHours: peakHours.map((h) => ({ hour: h.hour, count: h.order_count })),
          },
        };
      }
      case 'PROFIT': {
        const profitSummary = await this.financialEngine.getProfitSummary(cafeId!, from.toISOString(), to.toISOString());
        const ranking = await this.financialEngine.getProductProfitabilityRanking(cafeId!, from.toISOString(), to.toISOString());
        const trend = await this.engine.getSalesTrend(groupBy, 'custom', from.toISOString(), to.toISOString(), branchId, cafeId);

        const productProfits = ranking.products.slice(0, 10).map((p) => ({
          name: p.productName,
          units: p.orderCount,
          revenue: p.sellingPrice * p.orderCount,
          cost: p.estimatedCost * p.orderCount,
          profit: p.estimatedProfit * p.orderCount,
        }));

        return {
          rows: trend.map((t) => ({ period: t.period.toISOString(), revenue: t.revenue, profit: t.revenue * (profitSummary.profitMargin / 100) })) as Record<string, unknown>[],
          metrics: {
            totalRevenue: profitSummary.totalRevenue,
            totalCost: profitSummary.totalRevenue - profitSummary.grossProfit,
            grossProfit: profitSummary.grossProfit,
            profitMargin: profitSummary.profitMargin,
            netProfit: profitSummary.netProfit,
            topProducts: productProfits,
          },
        };
      }
      case 'INVENTORY': {
        const cafeInventoryFilter = cafeId ? Prisma.sql`AND i.cafe_id = ${cafeId}` : Prisma.empty;
        const inventory = await this.prisma.$queryRaw`
          SELECT i.id, i."itemName", i.unit, i."currentQty", i."minThreshold", i."costPerUnit",
                 CASE WHEN i."currentQty" <= 0 THEN 'OUT_OF_STOCK' WHEN i."currentQty" <= i."minThreshold" THEN 'LOW' ELSE 'NORMAL' END as stock_status
          FROM "inventories" i
          WHERE 1=1
          ${cafeInventoryFilter}
          ${branchId ? Prisma.sql`AND i.branch_id = ${branchId}` : Prisma.empty}
          ORDER BY i."currentQty" ASC
        `;
        const [orderUsage, inCafeUsage] = await Promise.all([
          this.prisma.$queryRaw`
            SELECT i."itemName", SUM(ri.quantity) as used_qty
            FROM "recipe_ingredients" ri JOIN "Inventory" i ON i.id = ri."inventory_id"
            JOIN "OrderItem" oi ON oi."productId" = ri."product_id"
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND o."paymentStatus" = 'PAID'
            ${cafeOrderFilter} ${branchId ? Prisma.sql`AND o.branch_id = ${branchId}` : Prisma.empty}
            GROUP BY i."itemName" ORDER BY used_qty DESC LIMIT 10
          `,
          this.prisma.$queryRaw`
            SELECT i."itemName", SUM(ri.quantity) as used_qty
            FROM "recipe_ingredients" ri JOIN "Inventory" i ON i.id = ri."inventory_id"
            JOIN "in_cafe_order_items" oi ON oi."product_id" = ri."product_id"
            JOIN "in_cafe_orders" o ON o.id = oi."order_id"
            WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND o."paymentStatus" = 'PAID'
            ${cafeOrderFilter}
            GROUP BY i."itemName" ORDER BY used_qty DESC LIMIT 10
          `,
        ]);
        // Merge usage
        const usageMap = new Map<string, number>();
        for (const row of (orderUsage as any[])) usageMap.set(row.itemName, Number(row.used_qty));
        for (const row of (inCafeUsage as any[])) usageMap.set(row.itemName, (usageMap.get(row.itemName) || 0) + Number(row.used_qty));
        const mergedUsage = Array.from(usageMap.entries())
          .map(([itemName, used_qty]) => ({ itemName, used_qty }))
          .sort((a, b) => b.used_qty - a.used_qty)
          .slice(0, 10);

        const invArray = inventory as Record<string, unknown>[];
        const lowCount = invArray.filter((i: any) => i.stock_status === 'LOW' || i.stock_status === 'OUT_OF_STOCK').length;
        return {
          rows: invArray,
          metrics: { totalItems: invArray.length, lowStockCount: lowCount, mostUsed: mergedUsage[0]?.itemName || 'N/A' },
        };
      }
      case 'EMPLOYEE_PERFORMANCE': {
        const topStaff = await this.engine.topStaffByOrders(cafeId!, 100, from.toISOString(), to.toISOString());
        const staffMetrics = topStaff.map((s) => ({
          id: s.staffId,
          name: s.name,
          role: 'BARISTA',
          ordersHandled: s.orderCount,
          deliveriesCompleted: 0,
          avgProcessingTime: 0,
        }));
        return {
          rows: staffMetrics,
          metrics: { totalEmployees: staffMetrics.length, topPerformer: staffMetrics[0]?.name || 'N/A' },
        };
      }
      default:
        return { rows: [], metrics: {} };
    }
  }

  private async calculateMetrics(type: string, data: { rows: Record<string, unknown>[]; metrics: Record<string, unknown> }) {
    return data.metrics;
  }
}




