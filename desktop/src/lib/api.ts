import type {
  AuditLogEntry,
  CategoryWithProducts,
  CreatePOSOrder,
  Customer,
  FavoriteWithProduct,
  HealthStatus,
  InventoryCategory,
  InventoryItem,
  InventorySummary,
  ModifierGroupWithOptions,
  NewCustomer,
  PaginatedResponse,
  POSOrder,
  Printer,
  PrinterInput,
  ProductSearchResult,
  SalesSummary,
  StockMovement,
  AdjustStockRequest,
  AdjustStockResponse,
  SyncStatus,
  SyncReport,
  SyncQueueEntry,
  UpdateCustomer,
} from '@/types';

const API_BASE = 'http://localhost:5112/api';

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new ApiError(res.status, errorBody || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  health: () => request<HealthStatus>('/health'),

  version: () => request<{ version: string; build: string; platform: string; arch: string }>('/version'),

  settings: {
    getAll: () => request<{ key: string; value: string }[]>('/settings'),
    set: (key: string, value: string) =>
      request<{ key: string; value: string }>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key, value }),
      }),
  },

  // ─── Inventory ──────────────────────────────────────────────

  inventory: {
    summary: () => request<InventorySummary>('/inventory/summary'),

    categories: {
      list: () => request<InventoryCategory[]>('/inventory/categories'),
      create: (data: { name: string; description?: string; color?: string; icon?: string; sortOrder?: number }) =>
        request<InventoryCategory>('/inventory/categories', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: { name: string; description?: string; color?: string; icon?: string; sortOrder: number; version: number }) =>
        request<InventoryCategory>(`/inventory/categories/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (id: string, version: number) =>
        request<void>(`/inventory/categories/${id}/${version}`, {
          method: 'DELETE',
        }),
    },

    items: {
      list: (params?: { page?: number; limit?: number; search?: string; categoryId?: string; supplierId?: string; lowStock?: boolean }) => {
        const q = new URLSearchParams();
        if (params?.page) q.set('page', String(params.page));
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.search) q.set('search', params.search);
        if (params?.categoryId) q.set('category_id', params.categoryId);
        if (params?.supplierId) q.set('supplier_id', params.supplierId);
        if (params?.lowStock) q.set('low_stock', 'true');
        return request<PaginatedResponse<InventoryItem>>(`/inventory/items?${q}`);
      },
      get: (id: string) => request<InventoryItem>(`/inventory/items/${id}`),
      create: (data: Partial<InventoryItem> & { name: string; currentQty: number; costPerUnit: number }) =>
        request<InventoryItem>('/inventory/items', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Partial<InventoryItem> & { id: string; cafeId: string; version: number; name: string; currentQty: number; costPerUnit: number }) =>
        request<InventoryItem>(`/inventory/items/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (id: string, version: number) =>
        request<void>(`/inventory/items/${id}/${version}`, { method: 'DELETE' }),
      movements: (id: string, params?: { page?: number; limit?: number }) => {
        const q = new URLSearchParams();
        if (params?.page) q.set('page', String(params.page));
        if (params?.limit) q.set('limit', String(params.limit));
        return request<PaginatedResponse<StockMovement>>(`/inventory/items/${id}/movements?${q}`);
      },
      adjust: (data: AdjustStockRequest) =>
        request<AdjustStockResponse>('/inventory/adjust', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
  },
  // ─── Customers ────────────────────────────────────────────

  customers: {
    list: (params?: { search?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<Customer[]>(`/api/customers${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<Customer>(`/api/customers/${id}`),
    create: (data: NewCustomer) =>
      request<Customer>('/api/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateCustomer) =>
      request<Customer>(`/api/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string, version: number) =>
      request<void>(`/api/customers/${id}/${version}`, { method: 'DELETE' }),
  },

  // ─── POS ──────────────────────────────────────────────────

  sync: {
    status: () => request<SyncStatus>('/sync/status'),

    trigger: () =>
      request<{ status: string; uploaded: number; failed: number; conflicts: number; skipped: number }>('/sync/trigger', {
        method: 'POST',
      }),

    report: () => request<SyncReport>('/sync/report'),

    authenticate: (cafeId: string, ownerCode: string, password: string) =>
      request<{ status: string; token: string; expiresAt: number; cafeName: string; cloudUrl: string }>('/sync/authenticate', {
        method: 'POST',
        body: JSON.stringify({ cafeId, ownerCode, password }),
      }),

    queue: () => request<SyncQueueEntry[]>('/sync/queue'),

    retryFailed: () =>
      request<{ status: string; resetCount: number }>('/sync/retry', { method: 'POST' }),

    config: (payload: Partial<{
      autoSync: boolean;
      syncIntervalMs: number;
      batchSize: number;
      maxRetries: number;
      encryptionEnabled: boolean;
      cloudUrl: string;
    }>) =>
      request<{ status: string }>('/sync/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  // ─── AI ───────────────────────────────────────────────────

  ai: {
    health: () => request<{ status: string; online: boolean; engine: string; offlineEnabled: boolean }>('/ai/health'),

    nlp: {
      parse: (text: string) =>
        request<{
          intent: string;
          confidence: number;
          entities: Array<{ entityType: string; value: string; confidence: number }>;
          rawText: string;
        }>('/ai/nlp/parse', {
          method: 'POST',
          body: JSON.stringify({ text }),
        }),
    },

    search: (query: string, limit?: number) =>
      request<Array<{
        productId: string;
        name: string;
        price: number;
        score: number;
        reason: string;
      }>>(`/ai/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`),

    insights: () =>
      request<Array<{
        category: string;
        title: string;
        description: string;
        severity: string;
        metric: number;
        trend: string;
        recommendation: string;
      }>>('/ai/insights'),

    forecast: (entityType: string, entityId: string, days?: number) =>
      request<{
        forecastType: string;
        entityId: string;
        entityName: string;
        period: string;
        values: number[];
        labels: string[];
        confidence: number;
        trend: string;
      }>(`/ai/forecast/${entityType}/${entityId}${days ? `?days=${days}` : ''}`),

    anomalies: () =>
      request<Array<{
        anomalyType: string;
        entityId: string;
        entityName: string;
        severity: string;
        currentValue: number;
        expectedValue: number;
        deviation: number;
        description: string;
        recommendation: string;
      }>>('/ai/anomalies'),

    copilot: {
      ask: (message: string, context?: Record<string, unknown>) =>
        request<{
          answer: string;
          confidence: number;
          sources: string[];
          suggestions: string[];
        }>('/ai/copilot/ask', {
          method: 'POST',
          body: JSON.stringify({ message, context }),
        }),
    },

    dashboard: () =>
      request<{
        insights: Array<{
          category: string;
          title: string;
          description: string;
          severity: string;
          metric: number;
          trend: string;
          recommendation: string;
        }>;
        anomalies: Array<{
          anomalyType: string;
          entityId: string;
          entityName: string;
          severity: string;
          currentValue: number;
          expectedValue: number;
          deviation: number;
          description: string;
          recommendation: string;
        }>;
        forecasts: Array<{
          forecastType: string;
          entityId: string;
          entityName: string;
          period: string;
          values: number[];
          labels: string[];
          confidence: number;
          trend: string;
        }>;
        topSuggestions: string[];
        healthScore: number;
        online: boolean;
      }>('/ai/dashboard'),

    offline: {
      status: () =>
        request<{
          enabled: boolean;
          modelVersion: string;
          lastTrained: string;
          accuracy: number;
          totalPredictions: number;
        }>('/ai/offline/status'),
    },

    suggestions: () =>
      request<string[]>('/ai/suggestions', { method: 'POST' }),
  },

  pos: {
    search: (q: string) => request<ProductSearchResult[]>(`/pos/search?q=${encodeURIComponent(q)}`),
    barcode: (code: string) => request<ProductSearchResult>(`/pos/search/barcode/${encodeURIComponent(code)}`),
    categories: () => request<CategoryWithProducts[]>('/pos/categories'),
    favorites: {
      list: (staffId: string) => request<FavoriteWithProduct[]>(`/pos/favorites?staff_id=${encodeURIComponent(staffId)}`),
      toggle: (staffId: string, productId: string) =>
        request<boolean>('/pos/favorites/toggle', {
          method: 'POST',
          body: JSON.stringify({ staffId, productId }),
        }),
    },
    modifiers: (productId: string) => request<ModifierGroupWithOptions[]>(`/pos/products/${productId}/modifiers`),
    orders: {
      create: (data: CreatePOSOrder) =>
        request<POSOrder>('/pos/orders', { method: 'POST', body: JSON.stringify(data) }),
      list: () => request<POSOrder[]>('/pos/orders'),
      active: () => request<POSOrder[]>('/pos/orders/active'),
      get: (id: string) => request<POSOrder>(`/pos/orders/${id}`),
      nextNumber: () => request<number>('/pos/orders/next-number'),
      addPayment: (orderId: string, method: string, amount: number, reference?: string | null, staffId?: string | null) =>
        request<POSOrder>(`/pos/orders/${orderId}/payment`, {
          method: 'POST',
          body: JSON.stringify({ method, amount, reference, staffId }),
        }),
      applyDiscount: (orderId: string, name: string, discountType: string, value: number, itemId?: string | null, staffId?: string | null) =>
        request<POSOrder>(`/pos/orders/${orderId}/discount`, {
          method: 'POST',
          body: JSON.stringify({ name, discountType, value, itemId, staffId }),
        }),
      removeDiscount: (orderId: string, discountId: string) =>
        request<POSOrder>(`/pos/orders/${orderId}/discount/${discountId}`, { method: 'DELETE' }),
      cancel: (orderId: string, reason: string, staffId?: string | null) =>
        request<POSOrder>(`/pos/orders/${orderId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason, staffId }),
        }),
      refund: (orderId: string, amount: number, reason: string, itemIds?: string[] | null, staffId?: string | null) =>
        request<POSOrder>(`/pos/orders/${orderId}/refund`, {
          method: 'POST',
          body: JSON.stringify({ amount, reason, itemIds, staffId }),
        }),
    },
    salesSummary: () => request<SalesSummary>('/pos/sales-summary'),
    auditLog: (since?: string, action?: string) => {
      const q = new URLSearchParams();
      if (since) q.set('since', since);
      if (action) q.set('action', action);
      return request<AuditLogEntry[]>(`/pos/audit-log?${q}`);
    },
    print: {
      receipt: (orderId: string) =>
        request<string>(`/pos/print/receipt/${orderId}`, { method: 'POST' }),
      cashDrawer: () =>
        request<string>('/pos/print/cash-drawer', { method: 'POST' }),
    },
    printers: {
      list: () => request<Printer[]>('/pos/printers'),
      create: (data: PrinterInput) =>
        request<string>('/pos/printers', { method: 'POST', body: JSON.stringify(data) }),
      delete: (id: string) =>
        request<void>(`/pos/printers/${id}`, { method: 'DELETE' }),
    },
  },
};

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
