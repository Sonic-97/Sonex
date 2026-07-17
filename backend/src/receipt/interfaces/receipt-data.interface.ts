export enum ReceiptType {
  CUSTOMER = 'CUSTOMER',
  KITCHEN = 'KITCHEN',
  BARISTA = 'BARISTA',
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
}

export enum PrinterType {
  ESCPOS = 'ESCPOS',
  WINDOWS = 'WINDOWS',
  PDF = 'PDF',
  BROWSER = 'BROWSER',
}

export enum PrintTrigger {
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  MERCHANT_ACCEPTED = 'MERCHANT_ACCEPTED',
  PREPARATION_STARTED = 'PREPARATION_STARTED',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  MANUAL_REPRINT = 'MANUAL_REPRINT',
}

export interface ReceiptItem {
  name: string;
  emoji?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string;
}

export interface ReceiptData {
  header: {
    cafeName: string;
    cafePhone: string;
    cafeAddress: string;
    cafeLogo?: string;
    branchName: string;
  };
  order: {
    code: string;
    type: string;
    tableNumber?: string;
    createdAt: Date;
    status: string;
    confirmedAt?: Date;
    preparedAt?: Date;
    readyAt?: Date;
    deliveredAt?: Date;
  };
  customer: {
    name: string;
    phone?: string;
  };
  items: ReceiptItem[];
  totals: {
    subtotal: number;
    discount?: number;
    total: number;
    paid: number;
    remaining: number;
  };
  payment: {
    method?: string;
    status: string;
    collectedBy?: string;
  };
}

export interface PrintJob {
  id: string;
  orderId: string;
  receiptType: ReceiptType;
  printerType: PrinterType;
  retriesLeft: number;
  maxRetries: number;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
}

export interface PrintResult {
  success: boolean;
  jobId: string;
  receiptType: ReceiptType;
  printerType: PrinterType;
  outputPath?: string;
  error?: string;
  printedAt: Date;
}

export interface ReceiptTemplateLine {
  type: 'header' | 'separator' | 'item' | 'total' | 'empty' | 'text' | 'title';
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  double?: boolean;
}
