import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue.config';
import { QueueService } from '../queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { ReportsService } from '../../reports/reports.service';
import { TenantContextService } from '../../common/tenant-context.service';

@Processor(QUEUE_NAMES.REPORTS, { concurrency: 2 })
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly reportsService: ReportsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const jobData = job.data as Record<string, unknown>;
    const { cafeId } = jobData as { cafeId?: string };
    this.logger.log(`Processing reports job ${job.id}: ${job.name}`);

    const execute = () => {
      switch (job.name) {
        case 'generate-report':
          return this.handleGenerateReport(job);
        case 'daily-sales':
          return this.handleDailySales(job);
        case 'monthly-revenue':
          return this.handleMonthlyRevenue(job);
        case 'employee-performance':
          return this.handleEmployeePerformance(job);
        default:
          this.logger.warn(`Unknown reports job: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };

    try {
      return cafeId ? TenantContextService.run(cafeId, execute) : execute();
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`Reports job ${job.id} failed: ${errorMsg}`);

      const reportJobId = (job.data as Record<string, unknown>).reportJobId as string | undefined;
      if (reportJobId) {
        await this.reportsService.failReportJob(reportJobId, errorMsg).catch(() => {});
      }

      if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
        await this.queueService.sendToDeadLetter(QUEUE_NAMES.REPORTS, {
          name: job.name,
          data: job.data,
          error: errorMsg,
        });
      }
      throw err;
    }
  }

  private async handleGenerateReport(job: Job<Record<string, unknown>>) {
    const { reportJobId, type, filters, userId, roleTarget, locale } = job.data as Record<string, unknown>;
    const reportId = reportJobId as string;
    const reportType = type as string;
    const filterObj: Record<string, unknown> = { ...(filters as Record<string, unknown>), locale: locale || 'en' };
    const uid = userId as string;
    const role = (roleTarget as string) || 'Cafe';

    await this.prisma.reportJob.update({
      where: { id: reportId },
      data: { status: 'processing' },
    });

    this.eventsService.emit('report.status', {
      jobId: reportId,
      status: 'processing',
      percentComplete: 30,
      message: 'Generating report data...',
    });

    const fileUrl = await this.reportsService.generateReportFile(reportType, filterObj, reportId, (filterObj.format as string) || 'PDF');

    await this.reportsService.completeReportJob(reportId, fileUrl);

    this.eventsService.emit('report.generated', {
      jobId: reportId,
      fileUrl,
      reportType,
      fileName: `${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf`,
    });

    const notifLocale = (locale as string) || 'en';
    const notifTitle = notifLocale === 'ar' ? `تقرير ${reportType} جاهز` : `${reportType} Report Ready`;
    const notifMessage = notifLocale === 'ar'
      ? `تم إنشاء تقرير ${reportType} وهو جاهز للتنزيل.`
      : `Your ${reportType} report has been generated and is ready for download.`;
    await this.notificationQueue.add('create-notification', {
      type: 'REPORT_READY',
      title: notifTitle,
      message: notifMessage,
      data: { jobId: reportId, fileUrl, reportType },
      userId: uid,
      roleTarget: role,
      locale: notifLocale,
    });

    this.logger.log(`Report ${reportType} generated: ${reportId} -> ${fileUrl}`);
    return { success: true, fileUrl, reportId };
  }

  private async handleDailySales(job: Job<Record<string, unknown>>) {
    const { date } = job.data as { date: string };
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        deliveredAt: { gte: startDate, lt: endDate },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalOrders = orders.length;

    this.eventsService.emit('report.generated', {
      reportType: 'daily-sales',
      date,
      totalRevenue,
      totalOrders,
      generatedAt: new Date().toISOString(),
    });

    this.logger.log(`Daily sales report for ${date}: ${totalOrders} orders, $${totalRevenue} revenue`);
    return { date, totalRevenue, totalOrders };
  }

  private async handleMonthlyRevenue(job: Job<Record<string, unknown>>) {
    const { year, month } = job.data as { year: number; month: number };
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        deliveredAt: { gte: startDate, lte: endDate },
      },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalOrders = orders.length;
    const monthName = startDate.toLocaleString('default', { month: 'long' });

    this.eventsService.emit('report.generated', {
      reportType: 'monthly-revenue',
      period: `${monthName} ${year}`,
      totalRevenue,
      totalOrders,
      generatedAt: new Date().toISOString(),
    });

    this.logger.log(`Monthly revenue report for ${monthName} ${year}: $${totalRevenue}`);
    return { period: `${monthName} ${year}`, totalRevenue, totalOrders };
  }

  private async handleEmployeePerformance(job: Job<Record<string, unknown>>) {
    const { date, staffId } = job.data as { date: string; staffId?: string };

    const where: Record<string, unknown> = { date: new Date(date) };
    if (staffId) where.staffId = staffId;

    const performances = await this.prisma.staffPerformance.findMany({
      where,
      include: { staff: { select: { id: true, name: true, role: true } } },
      orderBy: { overallScore: 'desc' },
    });

    this.eventsService.emit('report.generated', {
      reportType: 'employee-performance',
      date,
      employeeCount: performances.length,
      generatedAt: new Date().toISOString(),
    });

    this.logger.log(`Employee performance report for ${date}: ${performances.length} employees`);
    return { date, employeeCount: performances.length };
  }
}




