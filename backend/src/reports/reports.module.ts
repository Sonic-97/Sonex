import { Global, Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AnalyticsService } from './analytics.service';
import { PdfExportService } from './export/pdf-export.service';
import { ExcelExportService } from './export/excel-export.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, AnalyticsService, PdfExportService, ExcelExportService],
  exports: [ReportsService, AnalyticsService, PdfExportService, ExcelExportService],
})
export class ReportsModule {}




