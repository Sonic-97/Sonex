import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Req, Res, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BranchId, cafeId } from '../auth/decorators';
import { ReportsService } from './reports.service';
import { AnalyticsService } from './analytics.service';
import { GenerateReportDto, ReportQueryDto, AnalyticsKpiQueryDto, ChartQueryDto } from './dto';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post('reports/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Cafe', 'BARISTA')
  async generateReport(@Body() body: GenerateReportDto, @Req() req: any, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    const userId = req.user.id;
    const role = req.user.role;
    
    const allowed = role === 'Cafe'
      ? ['SALES', 'ORDERS', 'PROFIT', 'INVENTORY', 'EMPLOYEE_PERFORMANCE']
      : ['ORDERS', 'INVENTORY'];

    if (!allowed.includes(body.type)) {
      throw new ForbiddenException(`Report type ${body.type} not accessible for role ${role}`);
    }

    const filters = { ...body, branchId, cafeId };
    return this.reportsService.generateReport(body.type, filters, userId, role);
  }

  @Get('reports/:jobId/status')
  async getReportStatus(@Param('jobId') jobId: string, @Req() req: any, @cafeId() cafeId?: string) {
    return this.reportsService.getReportStatus(jobId, req.user.id, cafeId);
  }

  @Get('reports/:jobId/download')
  async downloadReport(@Param('jobId') jobId: string, @Req() req: any, @Res() res: Response, @cafeId() cafeId?: string) {
    const job = await this.reportsService.getReportDownload(jobId, req.user.id, cafeId);
    const filePath = job.fileUrl!;
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Report file not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fileName = `${job.type}_report_${new Date(job.createdAt).toISOString().split('T')[0]}${ext}`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  @Get('reports/available')
  async getAvailableReports(@Req() req: any, @cafeId() cafeId?: string) {
    return this.reportsService.getAvailableReports(req.user.id, req.user.role, cafeId);
  }

  @Get('reports/list')
  async getReportList(@Req() req: any, @Query() query: ReportQueryDto, @cafeId() cafeId?: string) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    return this.reportsService.getReportList(req.user.id, page, limit, cafeId);
  }

  @Delete('reports/:reportId')
  async deleteReport(@Param('reportId') reportId: string, @Req() req: any, @cafeId() cafeId?: string) {
    return this.reportsService.deleteReport(reportId, req.user.id, cafeId);
  }

  @Get('analytics/kpis')
  async getKpis(@Req() req: any, @Query() query: AnalyticsKpiQueryDto, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    if (req.user.role === 'DRIVER') {
      throw new ForbiddenException('Access denied');
    }
    return this.analytics.getKPIs(req.user.id, query.dateRange, query.from, query.to, branchId, cafeId);
  }

  @Get('analytics/charts/sales-trend')
  async getSalesTrend(@Query() query: ChartQueryDto, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.analytics.getSalesTrend(query.groupBy, query.dateRange, query.from, query.to, branchId, cafeId);
  }

  @Get('analytics/charts/order-distribution')
  async getOrderDistribution(@BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.analytics.getOrderDistribution(branchId, cafeId);
  }

  @Get('analytics/charts/revenue-by-category')
  async getRevenueByCategory(@Query('limit') limit?: string, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.analytics.getRevenueByCategory(parseInt(limit || '10', 10), branchId, cafeId);
  }

  @Get('analytics/charts/top-products')
  async getTopProducts(@Query('limit') limit?: string, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.analytics.getTopProducts(parseInt(limit || '10', 10), branchId, cafeId);
  }

  @Get('analytics/charts/peak-hours')
  async getPeakHours(@BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.analytics.getPeakHours(branchId, cafeId);
  }
}




