export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  WALLET = 'WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT = 'CREDIT',
  SPLIT = 'SPLIT',
  MIXED = 'MIXED',
}

export enum OrderSource {
  POS = 'pos',
  POS_SPLIT = 'pos_split',
  DELIVERY = 'delivery',
  IN_CAFE = 'in_cafe',
  UNIFIED = 'unified',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  REFUND = 'refund',
  REFUND_REVERSAL = 'refund_reversal',
  DEBT_SETTLEMENT = 'debt_settlement',
}

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  REFUND = 'refund',
  DEBT = 'debt',
  ADJUSTMENT = 'adjustment',
}

export interface PaymentItem {
  method: PaymentMethod;
  amount: number;
}

export interface ProcessPaymentInput {
  cafeId: string;
  branchId: string;
  orderId: string;
  orderCode: string;
  orderType: string;
  total: number;
  previousAmountPaid: number;
  previousPaymentStatus: string;
  collectedAmount: number;
  paymentStatus: string;
  paymentMethod?: string;
  collectedById?: string;
  collectedRole?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  splitPayments?: PaymentItem[];
}

export interface ProcessRefundInput {
  cafeId: string;
  branchId: string;
  orderId: string;
  refundAmount: number;
  reason: string;
  processedById?: string;
  itemIds?: string[];
  restoreInventory?: boolean;
}

export interface SettleDebtInput {
  debtId: string;
  cafeId?: string;
  settledById: string;
  settleAmount?: number;
}

export interface ProfitCalculationInput {
  cafeId: string;
  productId: string;
  productPrice: number;
  from?: Date;
  to?: Date;
}

export interface ProfitBreakdown {
  productId: string;
  productName: string;
  sellingPrice: number;
  ingredientCost: number;
  laborCost: number;
  operationalCost: number;
  utilityCost: number;
  miscellaneousCost: number;
  estimatedCost: number;
  estimatedProfit: number;
  profitMargin: number;
  orderCount: number;
  totalItemsSold: number;
  dateRange: { from: string; to: string };
}

export interface UnifiedDebtCustomer {
  name: string;
  phone?: string;
  totalDebt: number;
  orders: Array<{ type: string; id: string; amount: number; createdAt: Date }>;
}

export interface UnifiedDebtOverview {
  customers: UnifiedDebtCustomer[];
  totalOutstanding: number;
  customerCount: number;
}

export interface PaymentResult {
  orderId: string;
  paymentStatus: string;
  amountPaid: number;
  remainingAmount: number;
  transactionId?: string;
  cashWalletUpdated: boolean;
  debtCreated: boolean;
  customerUpdated: boolean;
}

export interface RefundResult {
  refundId: string;
  newAmountPaid: number;
  newPaymentStatus: string;
  inventoryRestored: boolean;
}
