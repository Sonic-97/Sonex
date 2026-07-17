import { Injectable } from '@nestjs/common';
import { ReceiptData, ReceiptType, ReceiptTemplateLine } from './interfaces/receipt-data.interface';

@Injectable()
export class ReceiptTemplateService {
  private formatCurrency(amount: number): string {
    return amount.toFixed(2);
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  build(data: ReceiptData, type: ReceiptType): ReceiptTemplateLine[] {
    switch (type) {
      case ReceiptType.CUSTOMER: return this.buildCustomerReceipt(data);
      case ReceiptType.KITCHEN: return this.buildKitchenTicket(data);
      case ReceiptType.BARISTA: return this.buildBaristaTicket(data);
      case ReceiptType.PICKUP: return this.buildPickupSlip(data);
      case ReceiptType.DELIVERY: return this.buildDeliverySlip(data);
    }
  }

  private buildCustomerReceipt(data: ReceiptData): ReceiptTemplateLine[] {
    return [
      { type: 'title', text: data.header.cafeName, align: 'center', bold: true, double: true },
      { type: 'text', text: data.header.cafeAddress, align: 'center' },
      { type: 'text', text: `Tel: ${data.header.cafePhone}`, align: 'center' },
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Order #: ${data.order.code}` },
      { type: 'text', text: `Date: ${this.formatDate(data.order.createdAt)}` },
      { type: 'text', text: `Type: ${data.order.type}${data.order.tableNumber ? ` | Table: ${data.order.tableNumber}` : ''}` },
      { type: 'separator', text: '-'.repeat(32) },
      { type: 'header', text: 'Item'.padEnd(20) + 'Qty'.padStart(5) + 'Price'.padStart(7) },
      { type: 'separator', text: '-'.repeat(32) },
      ...data.items.map(item => ({
        type: 'item' as const,
        text: `${item.emoji ? item.emoji + ' ' : ''}${item.name}`.padEnd(20) +
              item.quantity.toString().padStart(5) +
              this.formatCurrency(item.total).padStart(7),
      })),
      ...data.items.filter(i => i.notes).map(item => ({
        type: 'text' as const,
        text: `  Note: ${item.notes}`,
      })),
      { type: 'separator', text: '-'.repeat(32) },
      { type: 'total', text: `Subtotal`.padEnd(25) + this.formatCurrency(data.totals.subtotal).padStart(7) },
      ...(data.totals.discount ? [{ type: 'total' as const, text: `Discount`.padEnd(25) + `-${this.formatCurrency(data.totals.discount)}`.padStart(7) }] : []),
      { type: 'total', text: `Total`.padEnd(25) + this.formatCurrency(data.totals.total).padStart(7), bold: true },
      ...(data.totals.remaining > 0
        ? [{ type: 'total' as const, text: `Paid`.padEnd(25) + this.formatCurrency(data.totals.paid).padStart(7) },
           { type: 'total' as const, text: `Remaining`.padEnd(25) + this.formatCurrency(data.totals.remaining).padStart(7) }]
        : [{ type: 'total' as const, text: `Paid`.padEnd(25) + this.formatCurrency(data.totals.paid).padStart(7) }]),
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Payment: ${data.payment.method || data.payment.status}`, align: 'center' },
      { type: 'empty', text: '' },
      { type: 'text', text: 'Thank you for your visit!', align: 'center', bold: true },
      { type: 'text', text: '--- QR code placeholder ---', align: 'center' },
    ];
  }

  private buildKitchenTicket(data: ReceiptData): ReceiptTemplateLine[] {
    return [
      { type: 'title', text: 'KITCHEN TICKET', align: 'center', bold: true, double: true },
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Order #: ${data.order.code}` },
      { type: 'text', text: `Date: ${this.formatDate(data.order.createdAt)}` },
      ...(data.order.tableNumber ? [{ type: 'text' as const, text: `Table: ${data.order.tableNumber}` }] : []),
      { type: 'separator', text: '-'.repeat(32) },
      ...data.items.map(item => ({
        type: 'item' as const,
        text: `${item.quantity}x ${item.emoji ? item.emoji + ' ' : ''}${item.name}`,
      })),
      ...data.items.filter(i => i.notes).map(item => ({
        type: 'text' as const,
        text: `  Notes: ${item.notes}`,
      })),
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Customer: ${data.customer.name}`, align: 'center' },
    ];
  }

  private buildBaristaTicket(data: ReceiptData): ReceiptTemplateLine[] {
    const drinkItems = data.items.filter(i =>
      /قهوة|لاتيه|كابتشينو|اسبريسو|ميلك شيك|شاي|عصير|موكا|فرابيه|latte|cappuccino|espresso|mocha|frappe|shake|coffee|tea|juice|smoothie/i.test(i.name),
    );
    const items = drinkItems.length > 0 ? drinkItems : data.items;

    return [
      { type: 'title', text: 'BARISTA TICKET', align: 'center', bold: true, double: true },
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Order #: ${data.order.code}` },
      { type: 'text', text: `Date: ${this.formatDate(data.order.createdAt)}` },
      ...(data.order.tableNumber ? [{ type: 'text' as const, text: `Table: ${data.order.tableNumber}` }] : []),
      { type: 'separator', text: '-'.repeat(32) },
      ...items.map(item => ({
        type: 'item' as const,
        text: `${item.quantity}x ${item.emoji ? item.emoji + ' ' : ''}${item.name}`,
      })),
      ...items.filter(i => i.notes).map(item => ({
        type: 'text' as const,
        text: `  Notes: ${item.notes}`,
      })),
      { type: 'separator', text: '='.repeat(32) },
    ];
  }

  private buildPickupSlip(data: ReceiptData): ReceiptTemplateLine[] {
    return [
      { type: 'title', text: 'PICKUP SLIP', align: 'center', bold: true, double: true },
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Order #: ${data.order.code}` },
      { type: 'text', text: `Customer: ${data.customer.name}` },
      { type: 'separator', text: '-'.repeat(32) },
      ...data.items.map(item => ({
        type: 'item' as const,
        text: `${item.quantity}x ${item.emoji ? item.emoji + ' ' : ''}${item.name}`,
      })),
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: 'Ready for pickup!', align: 'center', bold: true },
    ];
  }

  private buildDeliverySlip(data: ReceiptData): ReceiptTemplateLine[] {
    return [
      { type: 'title', text: 'DELIVERY SLIP', align: 'center', bold: true, double: true },
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Order #: ${data.order.code}` },
      { type: 'text', text: `Customer: ${data.customer.name}` },
      ...(data.customer.phone ? [{ type: 'text' as const, text: `Phone: ${data.customer.phone}` }] : []),
      { type: 'separator', text: '-'.repeat(32) },
      ...data.items.map(item => ({
        type: 'item' as const,
        text: `${item.quantity}x ${item.emoji ? item.emoji + ' ' : ''}${item.name}`,
      })),
      ...data.items.filter(i => i.notes).map(item => ({
        type: 'text' as const,
        text: `  Notes: ${item.notes}`,
      })),
      { type: 'separator', text: '='.repeat(32) },
      { type: 'text', text: `Total: ${this.formatCurrency(data.totals.total)}`, align: 'center', bold: true },
    ];
  }
}
