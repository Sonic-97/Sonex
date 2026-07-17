export interface Cafe {
  id: string;
  name: string;
  cafeCode: string;
  phone?: string;
  address?: string;
}

export interface Branch {
  id: string;
  cafeId: string;
  name: string;
  slug: string;
  location?: string;
  active: boolean;
}

export interface AppSettings {
  theme: ThemeConfig;
  cafe: CafeConfig;
  sync: SyncConfig;
  printer: PrinterConfig;
  language: string;
}

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  accentColor: string;
}

export interface CafeConfig {
  cafeId: string;
  cafeName: string;
  branchId: string;
  branchName: string;
}

export interface SyncConfig {
  autoSync: boolean;
  syncIntervalSeconds: number;
  lastSyncAt: string | null;
}

export interface PrinterConfig {
  receiptPrinter: string;
  paperWidthMm: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  dbConnected: boolean;
  uptimeSeconds: number;
}

export interface SyncQueueItem {
  id: number;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
  href: string;
}

// ─── Inventory Types ─────────────────────────────────────────

export interface InventoryCategory {
  id: string;
  cafeId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface InventoryItem {
  id: string;
  cafeId: string;
  branchId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  productId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  purchaseUnit: string | null;
  consumptionUnit: string | null;
  conversionRatio: number;
  currentQty: number;
  minQty: number;
  maxQty: number;
  costPerUnit: number;
  supplierId: string | null;
  barcode: string | null;
  location: string | null;
  inventoryCategoryId: string | null;
  active: number;
}

export interface NewInventoryItem {
  name: string;
  sku?: string | null;
  category?: string | null;
  unit?: string;
  purchaseUnit?: string | null;
  consumptionUnit?: string | null;
  conversionRatio?: number;
  currentQty: number;
  minQty?: number;
  maxQty?: number;
  costPerUnit: number;
  supplierId?: string | null;
  barcode?: string | null;
  location?: string | null;
  inventoryCategoryId?: string | null;
  active?: number;
}

export interface StockMovement {
  id: string;
  cafeId: string;
  inventoryItemId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  quantity: number;
  previousQty: number;
  newQty: number;
  movementType: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  costPerUnit: number | null;
  totalCost: number | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InventorySummary {
  totalItems: number;
  lowStockItems: number;
  totalValue: number;
  totalCategories: number;
}

export interface AdjustStockRequest {
  itemId: string;
  itemVersion: number;
  quantity: number;
  movementType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  costPerUnit?: number | null;
}

export interface AdjustStockResponse {
  movement: StockMovement;
  newQty: number;
}

// ─── Customer Types ─────────────────────────────────────────

export interface Customer {
  id: string;
  cafeId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  tags: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  totalOrders: number;
  lastVisit: string | null;
  birthDate: string | null;
}

export interface NewCustomer {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  tags?: string | null;
  birthDate?: string | null;
}

export interface UpdateCustomer {
  id: string;
  cafeId: string;
  version: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  tags?: string | null;
  birthDate?: string | null;
  updatedBy?: string | null;
}

// ─── POS Types ─────────────────────────────────────────────

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  modifiers: AppliedModifier[];
  notes?: string | null;
}

export interface AppliedModifier {
  groupId?: string | null;
  optionId?: string | null;
  optionName: string;
  priceAdjustment: number;
}

export interface PaymentInput {
  method: string;
  amount: number;
  reference?: string | null;
}

export interface PaymentRecord {
  id: string;
  method: string;
  amount: number;
  reference?: string | null;
  createdAt: string;
}

export interface DiscountInput {
  name: string;
  discountType: string;
  value: number;
  itemId?: string | null;
}

export interface DiscountRecord {
  id: string;
  name: string;
  discountType: string;
  value: number;
  amount: number;
  itemId?: string | null;
}

export interface RefundInput {
  amount: number;
  reason: string;
  itemIds?: string[] | null;
  staffId?: string | null;
}

export interface RefundRecord {
  id: string;
  amount: number;
  reason: string;
  itemIds?: string[] | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface CreatePOSOrder {
  items: OrderItem[];
  payments: PaymentInput[];
  discounts: DiscountInput[];
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  source?: string | null;
  createdBy?: string | null;
}

export interface POSOrder {
  id: string;
  cafeId: string;
  orderNumber: number;
  status: string;
  items: OrderItem[];
  payments: PaymentRecord[];
  discounts: DiscountRecord[];
  refunds: RefundRecord[];
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  paidTotal: number;
  changeTotal: number;
  paymentStatus: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  source: string;
  createdBy?: string | null;
  createdAt: string;
}

export interface ProductSearchResult {
  id: string;
  name: string;
  price: number;
  barcode?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  active: boolean;
  hasModifiers: boolean;
}

export interface CategoryWithProducts {
  id: string;
  name: string;
  emoji?: string | null;
  products: ProductSearchResult[];
}

export interface FavoriteWithProduct {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  productBarcode?: string | null;
  productCategoryId?: string | null;
  productActive: number;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  cafeId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: number;
  sortOrder: number;
  active: number;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ModifierOption {
  id: string;
  cafeId: string;
  groupId: string;
  name: string;
  priceAdjustment: number;
  sortOrder: number;
  active: number;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ModifierGroupWithOptions {
  group: ModifierGroup;
  options: ModifierOption[];
}

export interface SalesSummary {
  totalOrders: number;
  totalRevenue: number;
  totalPaid: number;
  avgOrderValue: number;
}

export interface AuditLogEntry {
  id: string;
  cafeId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  staffId?: string | null;
  detailsJson?: string | null;
  createdAt: string;
}

export interface Printer {
  id: string;
  cafeId: string;
  name: string;
  printerType: string;
  interface: string;
  address?: string | null;
  port?: number | null;
  paperWidth: number;
  charsPerLine: number;
  active: number;
  isDefault: number;
  createdAt: string;
}

export interface PrinterInput {
  name: string;
  printerType?: string | null;
  interface?: string | null;
  address?: string | null;
  port?: number | null;
  paperWidth?: number | null;
  charsPerLine?: number | null;
  isDefault?: number | null;
}

// ─── AI Types ────────────────────────────────────────────────

export interface NlpResult {
  intent: string;
  confidence: number;
  entities: NlpEntity[];
  rawText: string;
}

export interface NlpEntity {
  entityType: string;
  value: string;
  confidence: number;
}

export interface AiSearchResult {
  productId: string;
  name: string;
  price: number;
  score: number;
  reason: string;
}

export interface BusinessInsight {
  category: string;
  title: string;
  description: string;
  severity: string;
  metric: number;
  trend: string;
  recommendation: string;
}

export interface ForecastResult {
  forecastType: string;
  entityId: string;
  entityName: string;
  period: string;
  values: number[];
  labels: string[];
  confidence: number;
  trend: string;
}

export interface AnomalyResult {
  anomalyType: string;
  entityId: string;
  entityName: string;
  severity: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  description: string;
  recommendation: string;
}

export interface CopilotQuery {
  message: string;
  context?: Record<string, unknown>;
}

export interface CopilotResponse {
  answer: string;
  confidence: number;
  sources: string[];
  suggestions: string[];
}

export interface AiDashboard {
  insights: BusinessInsight[];
  anomalies: AnomalyResult[];
  forecasts: ForecastResult[];
  topSuggestions: string[];
  healthScore: number;
  online: boolean;
}

export interface OfflineAiStatus {
  enabled: boolean;
  modelVersion: string;
  lastTrained: string;
  accuracy: number;
  totalPredictions: number;
}

// ─── Sync Types ──────────────────────────────────────────────

export interface SyncStatus {
  pendingCount: number;
  failedCount: number;
  completedCount: number;
  conflictCount: number;
  lastSyncVersion: number;
  lastSyncAt: string | null;
  online: boolean;
  isSyncing: boolean;
  lastError: string | null;
  authenticated: boolean;
  branchId: string | null;
  encryptionEnabled: boolean;
}

export interface SyncReport {
  timestamp: string;
  cafeId: string;
  branchId: string | null;
  authenticated: boolean;
  online: boolean;
  encryptionEnabled: boolean;
  queueStats: QueueStats;
  lastSync: LastSyncInfo;
  progress: SyncProgress;
  entityCounts: EntityCount[];
  recentErrors: SyncErrorEntry[];
  config: SyncConfigSummary;
}

export interface QueueStats {
  total: number;
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflict: number;
  totalRetries: number;
}

export interface LastSyncInfo {
  version: number;
  at: string | null;
  durationSeconds: number;
  itemsSynced: number;
  success: boolean;
  error: string | null;
}

export interface SyncProgress {
  phase: string;
  currentItem: number;
  totalItems: number;
  percentage: number;
  itemsSucceeded: number;
  itemsFailed: number;
  itemsConflicted: number;
  elapsedSeconds: number;
  message: string;
}

export interface EntityCount {
  entityType: string;
  count: number;
}

export interface SyncErrorEntry {
  entityType: string;
  entityId: string;
  error: string;
  retryCount: number;
  createdAt: string;
}

export interface SyncConfigSummary {
  autoSync: boolean;
  syncIntervalMs: number;
  batchSize: number;
  maxRetries: number;
  encryptionEnabled: boolean;
  cloudUrl: string;
}

export interface SyncQueueEntry {
  id: number;
  entityType: string;
  entityId: string;
  operation: string;
  status: string;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}
