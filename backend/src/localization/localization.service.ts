import { Injectable } from '@nestjs/common';

interface TranslationMap {
  [key: string]: string;
}

const EN: TranslationMap = {
  'report.not_found': 'Report not found',
  'report.access_denied': 'Access denied',
  'report.not_ready': 'Report not ready yet',
  'report.date_range_exceeded': 'Date range cannot exceed 1 year',
  'report.invalid_type': 'Invalid report type',
  'report.generate_failed': 'Failed to generate report',
  'auth.invalid_credentials': 'Invalid credentials',
  'auth.session_expired': 'Session expired',
  'auth.unauthorized': 'Unauthorized access',
  'order.not_found': 'Order not found',
  'order.invalid_status': 'Invalid status transition',
  'inventory.not_found': 'Inventory item not found',
  'inventory.insufficient_stock': 'Insufficient stock',
  'staff.not_found': 'Staff member not found',
  'driver.not_found': 'Driver not found',
  'customer.not_found': 'Customer not found',
  'payment.not_found': 'Payment not found',
  'validation.required': 'This field is required',
  'validation.invalid_format': 'Invalid format',
  'notification.not_found': 'Notification not found',
};

const AR: TranslationMap = {
  'report.not_found': 'التقرير غير موجود',
  'report.access_denied': 'تم رفض الوصول',
  'report.not_ready': 'التقرير ليس جاهزاً بعد',
  'report.date_range_exceeded': 'لا يمكن أن يتجاوز نطاق التاريخ سنة واحدة',
  'report.invalid_type': 'نوع تقرير غير صالح',
  'report.generate_failed': 'فشل إنشاء التقرير',
  'auth.invalid_credentials': 'بيانات الدخول غير صالحة',
  'auth.session_expired': 'انتهت الجلسة',
  'auth.unauthorized': 'وصول غير مصرح به',
  'order.not_found': 'الطلب غير موجود',
  'order.invalid_status': 'تغيير حالة غير صالح',
  'inventory.not_found': 'عنصر المخزون غير موجود',
  'inventory.insufficient_stock': 'مخزون غير كافٍ',
  'staff.not_found': 'الموظف غير موجود',
  'driver.not_found': 'السائق غير موجود',
  'customer.not_found': 'العميل غير موجود',
  'payment.not_found': 'الدفعة غير موجودة',
  'validation.required': 'هذا الحقل مطلوب',
  'validation.invalid_format': 'صيغة غير صالحة',
  'notification.not_found': 'الإشعار غير موجود',
};

@Injectable()
export class LocalizationService {
  private readonly messages: Record<string, TranslationMap> = {
    en: EN,
    ar: AR,
  };

  translate(key: string, locale: string = 'en'): string {
    return this.messages[locale]?.[key] || this.messages['en']?.[key] || key;
  }

  resolveLocale(acceptLanguage?: string): string {
    if (!acceptLanguage) return 'en';
    if (acceptLanguage.includes('ar')) return 'ar';
    if (acceptLanguage.includes('en')) return 'en';
    return 'en';
  }
}




