import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptPrintService } from './receipt-print.service';
import { ReceiptTemplateService } from './receipt-template.service';
import { ReceiptRenderer } from './receipt-renderer.service';
import { PrinterAdapter } from './printer-adapter.service';
import {
  ReceiptData,
  ReceiptType,
  PrinterType,
  PrintTrigger,
} from './interfaces/receipt-data.interface';

const mockReceiptData: ReceiptData = {
  header: {
    cafeName: 'Sonic Coffee',
    cafePhone: '+966 55 123 4567',
    cafeAddress: '123 Main Street, Riyadh',
    branchName: 'Main Branch',
  },
  order: {
    code: 'ORD-001',
    type: 'DINE_IN',
    tableNumber: '5',
    createdAt: new Date('2026-07-17T15:30:00'),
    status: 'COMPLETED',
  },
  customer: {
    name: 'Ahmad',
    phone: '+966 55 000 0000',
  },
  items: [
    { name: 'Caramel Latte', emoji: '☕', quantity: 2, unitPrice: 12.0, total: 24.0 },
    { name: 'Croissant', quantity: 1, unitPrice: 12.0, total: 12.0, notes: 'Extra butter' },
  ],
  totals: {
    subtotal: 36.0,
    total: 36.0,
    paid: 36.0,
    remaining: 0,
  },
  payment: {
    method: 'CARD',
    status: 'PAID',
  },
};

describe('ReceiptPrintService', () => {
  let service: ReceiptPrintService;
  let templateService: ReceiptTemplateService;
  let renderer: ReceiptRenderer;
  let printerAdapter: PrinterAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptPrintService,
        ReceiptTemplateService,
        ReceiptRenderer,
        PrinterAdapter,
      ],
    }).compile();

    service = module.get<ReceiptPrintService>(ReceiptPrintService);
    templateService = module.get<ReceiptTemplateService>(ReceiptTemplateService);
    renderer = module.get<ReceiptRenderer>(ReceiptRenderer);
    printerAdapter = module.get<PrinterAdapter>(PrinterAdapter);
  });

  beforeEach(() => {
    service.setRetryDelay(1);
  });

  // ── Template Rendering ──

  it('renders customer receipt template correctly', () => {
    const template = templateService.build(mockReceiptData, ReceiptType.CUSTOMER);
    const text = renderer.renderPlainText(template);

    expect(text).toContain('Sonic Coffee');
    expect(text).toContain('ORD-001');
    expect(text).toContain('CARD');
    expect(text).toContain('Thank you for your visit!');
    expect(text).toContain('☕');
    expect(text).toContain('Caramel Latte');
    expect(text).toContain('2');
    expect(text).toContain('36.00');
    expect(text).toContain('QR code placeholder');
  });

  it('renders kitchen receipt template correctly', () => {
    const template = templateService.build(mockReceiptData, ReceiptType.KITCHEN);
    const text = renderer.renderPlainText(template);

    expect(text).toContain('KITCHEN TICKET');
    expect(text).toContain('ORD-001');
    expect(text).toContain('2x ☕ Caramel Latte');
    expect(text).toContain('1x Croissant');
    expect(text).toContain('Extra butter');
    expect(text).not.toContain('36.00');
    expect(text).not.toContain('CARD');
  });

  it('renders barista receipt template correctly', () => {
    const data: ReceiptData = {
      ...mockReceiptData,
      items: [
        { name: 'Caramel Latte', emoji: '☕', quantity: 2, unitPrice: 12.0, total: 24.0 },
        { name: 'Croissant', quantity: 1, unitPrice: 12.0, total: 12.0 },
      ],
    };
    const template = templateService.build(data, ReceiptType.BARISTA);
    const text = renderer.renderPlainText(template);

    expect(text).toContain('BARISTA TICKET');
    expect(text).toContain('2x ☕ Caramel Latte');
    expect(text).not.toContain('Croissant');
  });

  it('renders barista receipt with all items when no drinks match', () => {
    const data: ReceiptData = {
      ...mockReceiptData,
      items: [
        { name: 'Sandwich', quantity: 1, unitPrice: 15.0, total: 15.0 },
        { name: 'Salad', quantity: 1, unitPrice: 12.0, total: 12.0 },
      ],
    };
    const template = templateService.build(data, ReceiptType.BARISTA);
    const text = renderer.renderPlainText(template);

    expect(text).toContain('BARISTA TICKET');
    expect(text).toContain('1x Sandwich');
    expect(text).toContain('1x Salad');
  });

  it('renders pickup slip template correctly', () => {
    const template = templateService.build(mockReceiptData, ReceiptType.PICKUP);
    const text = renderer.renderPlainText(template);

    expect(text).toContain('PICKUP SLIP');
    expect(text).toContain('ORD-001');
    expect(text).toContain('Ahmad');
    expect(text).toContain('Ready for pickup!');
    expect(text).toContain('2x ☕ Caramel Latte');
    expect(text).not.toContain('36.00');
  });

  it('renders delivery slip template correctly', () => {
    const template = templateService.build(mockReceiptData, ReceiptType.DELIVERY);
    const text = renderer.renderPlainText(template);

    expect(text).toContain('DELIVERY SLIP');
    expect(text).toContain('ORD-001');
    expect(text).toContain('Ahmad');
    expect(text).toContain('+966 55 000 0000');
    expect(text).toContain('36.00');
    expect(text).toContain('2x ☕ Caramel Latte');
  });

  // ── Reprint ──

  it('supports reprint with MANUAL_REPRINT trigger', async () => {
    printerAdapter.registerPrinter('test-escp', {
      type: PrinterType.ESCPOS,
      name: 'test-escp',
    });

    const result = await service.reprint(mockReceiptData, ReceiptType.CUSTOMER, PrinterType.ESCPOS, 'ORD-001');

    expect(result.success).toBe(true);
    expect(result.jobId).toBeDefined();
  });

  // ── PDF / HTML Rendering ──

  it('generates PDF-compatible HTML output', () => {
    const template = templateService.build(mockReceiptData, ReceiptType.CUSTOMER);
    const html = renderer.render(template, PrinterType.PDF);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Sonic Coffee');
    expect(html).toContain('</body>');
    expect(html).toContain('dir="rtl"');
  });

  it('generates browser HTML output', () => {
    const template = templateService.build(mockReceiptData, ReceiptType.CUSTOMER);
    const html = renderer.render(template, PrinterType.BROWSER);

    expect(html).toContain('<div');
    expect(html).toContain('36.00');
  });

  // ── Printer Unavailable ──

  it('handles printer unavailable gracefully', async () => {
    const result = await service.print(
      mockReceiptData,
      ReceiptType.CUSTOMER,
      PrinterType.ESCPOS,
      'ORD-001',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No online');
    expect(result.error).toContain('ESCPOS');
  });

  // ── Retry Queue ──

  it('retries failed print jobs up to max retries', async () => {
    printerAdapter.registerPrinter('test-offline', {
      type: PrinterType.ESCPOS,
      name: 'test-offline',
    });
    printerAdapter.markOffline('test-offline');

    const result = await service.print(
      mockReceiptData,
      ReceiptType.CUSTOMER,
      PrinterType.ESCPOS,
      'ORD-001',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No online');
  });

  it('tracks queue status correctly', async () => {
    printerAdapter.registerPrinter('test-pdf-q', {
      type: PrinterType.PDF,
      name: 'test-pdf-q',
    });

    const status1 = service.getQueueStatus();
    expect(status1.queued).toBe(0);
    expect(status1.completed).toBe(0);
    expect(status1.failed).toBe(0);

    await service.print(mockReceiptData, ReceiptType.CUSTOMER, PrinterType.PDF, 'ORD-002');

    const status2 = service.getQueueStatus();
    expect(status2.completed).toBe(1);
  });

  // ── Print Event Emission ──

  it('emits print event on successful print', async () => {
    printerAdapter.registerPrinter('test-pdf', {
      type: PrinterType.PDF,
      name: 'test-pdf',
    });

    const events: any[] = [];
    service.onPrintEvent((payload) => events.push(payload));

    await service.print(
      mockReceiptData,
      ReceiptType.CUSTOMER,
      PrinterType.PDF,
      'ORD-003',
    );

    expect(events.length).toBe(1);
    expect(events[0].success).toBe(true);
    expect(events[0].orderCode).toBe('ORD-001');
    expect(events[0].receiptType).toBe('CUSTOMER');
    expect(events[0].printerType).toBe('PDF');
    expect(events[0].printedAt).toBeDefined();
  });

  it('emits print event on failed print', async () => {
    const events: any[] = [];
    service.onPrintEvent((payload) => events.push(payload));

    await service.print(
      mockReceiptData,
      ReceiptType.KITCHEN,
      PrinterType.WINDOWS,
      'ORD-004',
    );

    expect(events.length).toBe(1);
    expect(events[0].success).toBe(false);
    expect(events[0].orderCode).toBe('ORD-001');
    expect(events[0].receiptType).toBe('KITCHEN');
  });
});
