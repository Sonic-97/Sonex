import { Injectable } from '@nestjs/common';

@Injectable()
export class ResponseService {
  orderCreated(order: any): string {
    return [
      '☕ تم استلام طلبك بنجاح',
      '',
      `رقم الطلب: ${order.code}`,
      `الإجمالي: ${Number(order.total).toFixed(2)}`,
      '',
      'جاري التحضير 🔥',
    ].join('\n');
  }

  orderStatus(order: any, status: string): string {
    const messages: Record<string, string> = {
      NEW: 'تم استلام طلبك ☕',
      PREPARING: 'طلبك جاري التحضير 🔥',
      READY: 'طلبك جاهز للاستلام ✅',
      DELIVERED: 'تم تسليم الطلب، بالهناء ☕',
    };

    const line = messages[status] || `حالة الطلب: ${status}`;
    return `${line}\n\nرقم الطلب: ${order.code}`;
  }

  unknownRequest(): string {
    return 'عذراً، لم أفهم طلبك\nبرجاء إعادة الصياغة';
  }

  missingProduct(): string {
    return 'عذراً، هذا المنتج غير متوفر حالياً';
  }
}




