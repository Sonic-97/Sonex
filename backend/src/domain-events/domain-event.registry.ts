export const DomainEventTypes = {
  ORDER_CREATED: 'domain.order.created',
  ORDER_CONFIRMED: 'domain.order.confirmed',
  ORDER_CANCELLED: 'domain.order.cancelled',
  ORDER_READY: 'domain.order.ready',
  ORDER_PICKED_UP: 'domain.order.picked_up',
  ORDER_DELIVERED: 'domain.order.delivered',
  ORDER_PAID: 'domain.order.paid',
  ORDER_REFUNDED: 'domain.order.refunded',
  ORDER_STATUS_CHANGED: 'domain.order.status.changed',

  INVENTORY_RESERVED: 'domain.inventory.reserved',
  INVENTORY_CONSUMED: 'domain.inventory.consumed',
  INVENTORY_REFILLED: 'domain.inventory.refilled',
  INVENTORY_LOW_STOCK: 'domain.inventory.low_stock',
  INVENTORY_RELEASED: 'domain.inventory.released',
  INVENTORY_CONFLICT_DETECTED: 'domain.inventory.conflict_detected',
  INVENTORY_ADJUSTED: 'domain.inventory.adjusted',
  RESERVATION_EXPIRED: 'domain.inventory.reservation_expired',

  PAYMENT_COMPLETED: 'domain.payment.completed',
  PAYMENT_COLLECTED: 'domain.payment.collected',

  DEBT_CREATED: 'domain.debt.created',
  DEBT_PAID: 'domain.debt.paid',

  RECIPE_UPDATED: 'domain.recipe.updated',

  CUSTOMER_CREATED: 'domain.customer.created',
  CUSTOMER_UPDATED: 'domain.customer.updated',

  EMPLOYEE_CREATED: 'domain.employee.created',

  BRANCH_CREATED: 'domain.branch.created',

  FINANCE_REVENUE_UPDATED: 'domain.finance.revenue.updated',
  FINANCE_DAILY_SNAPSHOT: 'domain.finance.daily.snapshot',

  INCARE_ORDER_CREATED: 'domain.incare.order.created',
  INCARE_PAYMENT_UPDATED: 'domain.incare.payment.updated',

  STAFF_PURCHASE_CREATED: 'domain.staff.purchase.created',
} as const;

export type DomainEventType = (typeof DomainEventTypes)[keyof typeof DomainEventTypes];

export interface OrderCreatedDomainPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  status: string;
  total: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    options?: Record<string, string>;
  }>;
  sourceType: string;
  createdById?: string;
  employeeId?: string;
}

export interface OrderStatusChangedDomainPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  from: string;
  to: string;
  total: number;
  customerPhone?: string;
  customerName?: string;
  changedById?: string;
}

export interface OrderPaidDomainPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  amount: number;
  method: string;
  collectedById: string;
  collectedByRole: string;
}

export interface OrderRefundedDomainPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  amount: number;
  reason?: string;
  refundedById: string;
}

export interface InventoryConsumedDomainPayload {
  orderId: string;
  cafeId: string;
  branchId: string;
  deductions: Array<{
    inventoryId: string;
    itemName: string;
    quantityDeducted: number;
    unit: string;
    remainingStock: number;
    costPerUnit: number;
    totalCost: number;
  }>;
  totalCost: number;
}

export interface InventoryRefilledDomainPayload {
  inventoryId: string;
  itemName: string;
  cafeId: string;
  branchId: string;
  quantityAdded: number;
  newQuantity: number;
  unit: string;
  cost: number;
  supplier?: string;
  purchaseId?: string;
}

export interface InventoryLowStockDomainPayload {
  inventoryId: string;
  itemName: string;
  cafeId: string;
  branchId: string;
  currentQty: number;
  threshold: number;
  unit: string;
}

export interface PaymentCompletedDomainPayload {
  paymentId?: string;
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  amount: number;
  method: string;
  paymentStatus: string;
  remainingAmount: number;
  collectedById: string;
  collectedByRole: string;
  isDelivery: boolean;
}

export interface DebtCreatedDomainPayload {
  debtId?: string;
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  source: 'DELIVERY' | 'IN_CAFE';
}

export interface DebtPaidDomainPayload {
  debtId: string;
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  customerName: string;
  amount: number;
  paidById: string;
  paidAt: string;
}

export interface RecipeUpdatedDomainPayload {
  productId: string;
  productName: string;
  cafeId: string;
  updatedById?: string;
}

export interface CustomerCreatedDomainPayload {
  customerId: string;
  name: string;
  phone: string;
  cafeId: string;
}

export interface CustomerUpdatedDomainPayload {
  customerId: string;
  name: string;
  phone: string;
  cafeId: string;
  changes: string[];
}

export interface EmployeeCreatedDomainPayload {
  staffId: string;
  name: string;
  role: string;
  phone: string;
  cafeId: string;
  branchId: string;
}

export interface BranchCreatedDomainPayload {
  branchId: string;
  name: string;
  cafeId: string;
}

export interface FinanceRevenueUpdatedDomainPayload {
  orderId: string;
  orderCode: string;
  totalRevenue: number;
  profit: number;
  cafeId: string;
}

export interface FinanceDailySnapshotDomainPayload {
  totalRevenue: number;
  profit: number;
  ordersCount: number;
  cafeId: string;
  branchId: string;
  date: string;
}

export interface InCafeOrderCreatedDomainPayload {
  orderId: string;
  customerName: string;
  cafeId: string;
  branchId: string;
  total: number;
  items: Array<{ productName: string; quantity: number; price: number }>;
}

export interface StaffPurchaseCreatedDomainPayload {
  purchaseId: string;
  staffId: string;
  cafeId: string;
  branchId: string;
  amount: number;
  description: string;
}

export interface InventoryReleasedDomainPayload {
  orderId: string;
  cafeId: string;
  inventoryId: string;
  itemName: string;
  quantity: number;
  action: 'release_active' | 'restore_confirmed';
}

export interface InventoryConflictDetectedDomainPayload {
  inventoryId: string;
  itemName: string;
  cafeId: string;
  orderId?: string;
  attemptedVersion: number;
  currentVersion: number;
  operation: 'reserve' | 'confirm' | 'release' | 'adjust';
  retryAttempt: number;
}

export interface InventoryAdjustedDomainPayload {
  inventoryId: string;
  itemName: string;
  cafeId: string;
  branchId: string;
  previousQty: number;
  newQty: number;
  previousReserved: number;
  newReserved: number;
  reason: string;
  adjustedById?: string;
}

export interface ReservationExpiredDomainPayload {
  reservationId: string;
  inventoryId: string;
  orderId: string;
  cafeId: string;
  quantity: number;
  ageMinutes: number;
}

export interface DomainEventPayloadMap {
  [DomainEventTypes.ORDER_CREATED]: OrderCreatedDomainPayload;
  [DomainEventTypes.ORDER_CONFIRMED]: OrderStatusChangedDomainPayload;
  [DomainEventTypes.ORDER_CANCELLED]: OrderStatusChangedDomainPayload;
  [DomainEventTypes.ORDER_READY]: OrderStatusChangedDomainPayload;
  [DomainEventTypes.ORDER_PICKED_UP]: OrderStatusChangedDomainPayload;
  [DomainEventTypes.ORDER_DELIVERED]: OrderStatusChangedDomainPayload;
  [DomainEventTypes.ORDER_PAID]: OrderPaidDomainPayload;
  [DomainEventTypes.ORDER_REFUNDED]: OrderRefundedDomainPayload;
  [DomainEventTypes.ORDER_STATUS_CHANGED]: OrderStatusChangedDomainPayload;
  [DomainEventTypes.INVENTORY_RESERVED]: InventoryConsumedDomainPayload;
  [DomainEventTypes.INVENTORY_CONSUMED]: InventoryConsumedDomainPayload;
  [DomainEventTypes.INVENTORY_REFILLED]: InventoryRefilledDomainPayload;
  [DomainEventTypes.INVENTORY_LOW_STOCK]: InventoryLowStockDomainPayload;
  [DomainEventTypes.INVENTORY_RELEASED]: InventoryReleasedDomainPayload;
  [DomainEventTypes.INVENTORY_CONFLICT_DETECTED]: InventoryConflictDetectedDomainPayload;
  [DomainEventTypes.INVENTORY_ADJUSTED]: InventoryAdjustedDomainPayload;
  [DomainEventTypes.RESERVATION_EXPIRED]: ReservationExpiredDomainPayload;
  [DomainEventTypes.PAYMENT_COMPLETED]: PaymentCompletedDomainPayload;
  [DomainEventTypes.PAYMENT_COLLECTED]: PaymentCompletedDomainPayload;
  [DomainEventTypes.DEBT_CREATED]: DebtCreatedDomainPayload;
  [DomainEventTypes.DEBT_PAID]: DebtPaidDomainPayload;
  [DomainEventTypes.RECIPE_UPDATED]: RecipeUpdatedDomainPayload;
  [DomainEventTypes.CUSTOMER_CREATED]: CustomerCreatedDomainPayload;
  [DomainEventTypes.CUSTOMER_UPDATED]: CustomerUpdatedDomainPayload;
  [DomainEventTypes.EMPLOYEE_CREATED]: EmployeeCreatedDomainPayload;
  [DomainEventTypes.BRANCH_CREATED]: BranchCreatedDomainPayload;
  [DomainEventTypes.FINANCE_REVENUE_UPDATED]: FinanceRevenueUpdatedDomainPayload;
  [DomainEventTypes.FINANCE_DAILY_SNAPSHOT]: FinanceDailySnapshotDomainPayload;
  [DomainEventTypes.INCARE_ORDER_CREATED]: InCafeOrderCreatedDomainPayload;
  [DomainEventTypes.STAFF_PURCHASE_CREATED]: StaffPurchaseCreatedDomainPayload;
}
