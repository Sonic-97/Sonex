import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ar: {
    'Sonic Coffee OS': 'نظام سونيك كوفي',
    'Report': 'تقرير',
    'Generated': 'تم الإنشاء في',
    'Filters': 'التصفية',
    'Summary': 'الملخص',
    'Metric': 'المؤشر',
    'Value': 'القيمة',
    'Data': 'البيانات',
    'No data': 'لا توجد بيانات',
    '— End of Report —': '— نهاية التقرير —',
    'Report Type': 'نوع التقرير',
    'SALES': 'المبيعات',
    'ORDERS': 'الطلبات',
    'PROFIT': 'الأرباح',
    'INVENTORY': 'المخزون',
    'EMPLOYEE_PERFORMANCE': 'أداء الموظفين',
    'totalRevenue': 'إجمالي الإيرادات',
    'totalOrders': 'إجمالي الطلبات',
    'avgOrderValue': 'متوسط قيمة الطلب',
    'pendingPayments': 'المدفوعات المعلقة',
    'activeOrders': 'الطلبات النشطة',
    'lowStockItems': 'عناصر المخزون المنخفض',
    'currentOrders': 'الطلبات الحالية',
    'previousOrders': 'الطلبات السابقة',
    'weeklyTrend': 'الاتجاه الأسبوعي (%)',
    'monthlyGrowth': 'النمو الشهري (%)',
    'totalCost': 'إجمالي التكلفة',
    'grossProfit': 'ربح المبيعات',
    'profitMargin': 'هامش الربح (%)',
    'netProfit': 'صافي الأرباح',
    'totalItems': 'إجمالي العناصر',
    'lowStockCount': 'عدد العناصر منخفضة المخزون',
    'mostUsed': 'العنصر الأكثر استخداماً',
    'totalEmployees': 'إجمالي الموظفين',
    'topPerformer': 'أفضل أداء',
    'ordersHandled': 'الطلبات التي تم معالجتها',
    'deliveriesCompleted': 'التوصيلات المكتملة',
    'avgProcessingTime': 'متوسط وقت المعالجة (دقائق)',
  },
  en: {
    'Sonic Coffee OS': 'Sonic Coffee OS',
    'Report': 'Report',
    'Generated': 'Generated At',
    'Filters': 'Filters',
    'Summary': 'Summary',
    'Metric': 'Metric',
    'Value': 'Value',
    'Data': 'Data',
    'No data': 'No data',
    '— End of Report —': '— End of Report —',
    'Report Type': 'Report Type',
    'SALES': 'Sales',
    'ORDERS': 'Orders',
    'PROFIT': 'Profit',
    'INVENTORY': 'Inventory',
    'EMPLOYEE_PERFORMANCE': 'Employee Performance',
    'totalRevenue': 'Total Revenue',
    'totalOrders': 'Total Orders',
    'avgOrderValue': 'Average Order Value',
    'pendingPayments': 'Pending Payments',
    'activeOrders': 'Active Orders',
    'lowStockItems': 'Low Stock Items',
    'currentOrders': 'Current Orders',
    'previousOrders': 'Previous Orders',
    'weeklyTrend': 'Weekly Trend (%)',
    'monthlyGrowth': 'Monthly Growth (%)',
    'totalCost': 'Total Cost',
    'grossProfit': 'Gross Profit',
    'profitMargin': 'Profit Margin (%)',
    'netProfit': 'Net Profit',
    'totalItems': 'Total Items',
    'lowStockCount': 'Low Stock Count',
    'mostUsed': 'Most Used Item',
    'totalEmployees': 'Total Employees',
    'topPerformer': 'Top Performer',
    'ordersHandled': 'Orders Handled',
    'deliveriesCompleted': 'Deliveries Completed',
    'avgProcessingTime': 'Avg Processing Time (min)',
  }
};

const t = (key: string, locale: string = 'en') => {
  const dict = TRANSLATIONS[locale] || TRANSLATIONS.en;
  return dict[key] || dict[key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())] || key;
};

@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  async generateReport(reportType: string, metrics: Record<string, unknown>, data: Record<string, unknown>[], filters: Record<string, unknown>, jobId: string): Promise<string> {
    const locale = (filters.locale as string) || 'en';
    
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = t('Sonic Coffee OS', locale);
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet(t('Summary', locale));
    summarySheet.columns = [
      { header: t('Metric', locale), key: 'metric', width: 30 },
      { header: t('Value', locale), key: 'value', width: 20 }
    ];
    summarySheet.addRow([t('Report Type', locale), t(reportType, locale)]);
    summarySheet.addRow([t('Generated', locale), new Date().toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')]);
    summarySheet.addRow([t('Filters', locale), JSON.stringify(filters)]);
    summarySheet.addRow([]);

    const metricsObj = metrics as Record<string, unknown>;
    Object.entries(metricsObj).slice(0, 20).forEach(([key, val]) => {
      const display = typeof val === 'number' ? (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('profit') || key.toLowerCase().includes('cost') ? Number(val).toFixed(2) : String(val)) : String(val);
      summarySheet.addRow({ metric: t(key, locale), value: display });
    });
    summarySheet.getRow(1).font = { bold: true };

    const dataSheet = workbook.addWorksheet(t('Data', locale));
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      dataSheet.columns = headers.map((h) => ({ header: t(h, locale), key: h, width: 20 }));
      data.forEach((row) => {
        const localizedRow: Record<string, unknown> = {};
        for (const [rk, rv] of Object.entries(row)) {
          localizedRow[rk] = typeof rv === 'string' ? t(rv, locale) : rv;
        }
        dataSheet.addRow(localizedRow);
      });
      dataSheet.getRow(1).font = { bold: true };
    } else {
      dataSheet.addRow([t('No data', locale)]);
    }

    const storageDir = process.env.REPORT_FILE_STORAGE_PATH || path.join(process.cwd(), 'public', 'reports');
    const dir = path.join(storageDir, 'excel');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${jobId}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    this.logger.log(`Excel report generated: ${filePath}`);
    return filePath;
  }
}




