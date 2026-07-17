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
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  async generateReport(reportType: string, metrics: Record<string, unknown>, filters: Record<string, unknown>, jobId: string): Promise<string> {
    const storageDir = process.env.REPORT_FILE_STORAGE_PATH || path.join(process.cwd(), 'public', 'reports');
    const dir = path.join(storageDir, 'pdf');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${jobId}.pdf`);

    const locale = (filters.locale as string) || 'en';

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(22).text(t('Sonic Coffee OS', locale), { align: 'center' });
    doc.fontSize(16).text(`${t(reportType, locale)} ${t('Report', locale)}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`${t('Generated', locale)}: ${new Date().toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}`, { align: 'center' });
    doc.text(`${t('Filters', locale)}: ${JSON.stringify(filters)}`, { align: 'center' });
    doc.moveDown(2);

    const metricsObj = metrics as Record<string, unknown>;
    const summaryKeys = Object.keys(metricsObj).slice(0, 12);
    summaryKeys.forEach((key) => {
      const val = metricsObj[key];
      const display = typeof val === 'number' ? (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('profit') || key.toLowerCase().includes('cost') ? `$${Number(val).toFixed(2)}` : String(val)) : String(val);
      doc.fontSize(11).text(`${t(key, locale)}: ${display}`);
    });

    doc.moveDown();
    doc.fontSize(9).text(t('— End of Report —', locale), { align: 'center' });
    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        this.logger.log(`PDF report generated: ${filePath}`);
        resolve(filePath);
      });
      stream.on('error', reject);
    });
  }
}




