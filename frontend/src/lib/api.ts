import axios from 'axios';

let isRefreshing = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(undefined);
  });
  failedQueue = [];
}

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send httpOnly cookies automatically
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const selectedBranchId = localStorage.getItem('SONIC_BRANCH_ID');
    if (selectedBranchId) {
      config.headers['x-branch-id'] = selectedBranchId;
    }
    const cafeId = sessionStorage.getItem('sonic_cafe_id');
    if (cafeId) {
      config.headers['x-cafe-id'] = cafeId;
    }
    const token = sessionStorage.getItem('sonic_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshRes = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        if (refreshRes.data?.accessToken && typeof window !== 'undefined') {
          sessionStorage.setItem('sonic_token', refreshRes.data.accessToken);
        }
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (typeof window !== 'undefined') {
          const cached = sessionStorage.getItem('sonic_user');
          const currentPath = window.location.pathname;
          if (!cached && !currentPath.includes('/login') && !currentPath.includes('/auth')) {
            sessionStorage.removeItem('sonic_user');
            window.location.href = '/auth';
          }
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export async function fetchOwnerDashboard() {
  const { data } = await api.get('/dashboard/Cafe');
  return data;
}

export async function fetchOrders() {
  const { data } = await api.get('/orders');
  return data;
}

export async function fetchStaff() {
  const { data } = await api.get('/staff');
  return data;
}

export async function fetchDrivers() {
  const { data } = await api.get('/drivers');
  return data;
}

export async function fetchTopProducts(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await api.get(`/analytics/sales/top-products?${params}`);
  return data;
}

export async function fetchTotalRevenue(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await api.get(`/analytics/revenue/summary?${params}`);
  return data;
}

export async function updateOrderStatus(orderId: string, status: string, userId?: string, role?: string) {
  const body: Record<string, string> = { status };
  if (userId) body.userId = userId;
  if (role) body.role = role;
  const { data } = await api.patch(`/orders/${orderId}/status`, body);
  return data;
}

export async function cancelOrder(orderId: string) {
  const { data } = await api.patch(`/orders/${orderId}/cancel`);
  return data;
}

export async function fetchWhatsAppOrders() {
  const { data: whatsappOrders } = await api.get('/orders', { params: { sourceType: 'WHATSAPP_ORDER' } });
  const { data: telegramOrders } = await api.get('/orders', { params: { sourceType: 'TELEGRAM_ORDER' } });
  const merged = [...(Array.isArray(whatsappOrders) ? whatsappOrders : []), ...(Array.isArray(telegramOrders) ? telegramOrders : [])];
  return merged;
}

export async function fetchBaristaQueue() {
  console.log('[API FETCH] fetchBaristaQueue called');
  const { data } = await api.get('/orders/barista/queue');
  return data;
}

export async function fetchOrdersByStatus(status: string) {
  const { data } = await api.get(`/orders?status=${status}`);
  return data;
}

export async function fetchFinancialSnapshot() {
  const { data } = await api.get('/financial/today');
  return data;
}

export async function fetchAnalyticsOverview() {
  const { data } = await api.get('/analytics/overview');
  return data;
}

export async function fetchRevenueSummary() {
  const { data } = await api.get('/analytics/revenue/summary');
  return data;
}

export async function fetchHealthScore() {
  const { data } = await api.get('/analytics/business/health-score');
  return data;
}

export async function fetchStaffPerformanceOverview() {
  const { data } = await api.get('/staff/performance/overview');
  return data;
}

export async function fetchStaffPerformanceTop(limit = 5) {
  const { data } = await api.get(`/staff/performance/top?limit=${limit}`);
  return data;
}

export async function fetchStaffPerformanceUnder(threshold = 40) {
  const { data } = await api.get(`/staff/performance/underperforming?threshold=${threshold}`);
  return data;
}

export async function fetchDailyRanking() {
  const { data } = await api.get('/staff/performance/ranking/daily');
  return data;
}

export async function fetchAiDecisions(limit = 20) {
  const { data } = await api.get(`/ai-decisions/daily?limit=${limit}`);
  return data;
}

export async function fetchAiWeeklyStrategy() {
  const { data } = await api.get('/ai-decisions/weekly');
  return data;
}

export async function fetchAiRevenueDecisions() {
  const { data } = await api.get('/ai-decisions/revenue');
  return data;
}

export async function fetchAiStaffDecisions() {
  const { data } = await api.get('/ai-decisions/staff');
  return data;
}

export async function fetchAiProductDecisions() {
  const { data } = await api.get('/ai-decisions/products');
  return data;
}

export async function fetchAiRiskDecisions() {
  const { data } = await api.get('/ai-decisions/risks');
  return data;
}

// OWNER COPILOT AND OWNER-APPROVED ACTIONS

export async function askOwnerCopilot(question: string, sessionId: string) {
  const { data } = await api.post('/owner-copilot/ask', { question, sessionId });
  return data;
}

export async function fetchOwnerCopilotSuggestions() {
  const { data } = await api.get('/owner-copilot/suggestions');
  return data;
}

export async function submitOwnerCopilotFeedback(
  contextId: string,
  feedback: 'USEFUL' | 'NOT_USEFUL' | 'WRONG_NUMBERS' | 'TOO_LONG',
) {
  const { data } = await api.post('/owner-copilot/feedback', { contextId, feedback });
  return data;
}

export async function approveOwnerAction(proposalId: string, approvalText: string, confirmationCode?: string) {
  const { data } = await api.post(`/owner-actions/proposals/${encodeURIComponent(proposalId)}/approve`, {
    approvalText,
    confirmationCode,
  });
  return data;
}

export async function rejectOwnerAction(proposalId: string, reason: string) {
  const { data } = await api.post(`/owner-actions/proposals/${encodeURIComponent(proposalId)}/reject`, { reason });
  return data;
}

export async function cancelOwnerAction(proposalId: string) {
  const { data } = await api.post(`/owner-actions/proposals/${encodeURIComponent(proposalId)}/cancel`);
  return data;
}

export async function editOwnerAction(proposalId: string, proposedState: Record<string, unknown>, reason: string) {
  const { data } = await api.post(`/owner-actions/proposals/${encodeURIComponent(proposalId)}/edit`, {
    proposedState,
    reason,
  });
  return data;
}

// STAGE 5 FORECASTING (read-only calculations)
export async function fetchForecastingEntities() {
  const { data } = await api.get('/forecasting/entities');
  return data;
}

export async function runForecast(input: {
  type: string; entityId?: string; branchId?: string; from?: string; to?: string; horizonDays?: number;
}) {
  const { data } = await api.post('/forecasting/forecast', input);
  return data;
}

export async function runSimulation(input: {
  type: string; productIds: string[]; branchId?: string; discountValue?: number;
  proposedPrice?: number; maxRedemptions?: number; from?: string; to?: string;
}) {
  const { data } = await api.post('/forecasting/simulate', input);
  return data;
}

export async function compareForecastScenarios(scenarios: Array<Record<string, unknown>>) {
  const { data } = await api.post('/forecasting/compare', { scenarios });
  return data;
}

export async function submitForecastFeedback(resultId: string, feedback: string) {
  const { data } = await api.post('/forecasting/feedback', { resultId, feedback });
  return data;
}

// ── IN-CAFÉ ORDERS ──

export async function searchCustomers(query: string) {
  const { data } = await api.get(`/customers/search?q=${encodeURIComponent(query)}`);
  return data;
}

export async function fetchEmployeeKpi(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const { data } = await api.get(`/orders/employee-kpi?${params}`);
  return data;
}

export async function createInCafeOrder(payload: {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  orderType?: string;
  tableNumber?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  sourceType?: string;
  employeeId?: string;
  createdById: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice?: number;
    notes?: string;
    selectedOptions?: Array<{ optionId: string; choiceLabel: string }>;
  }[];
}) {
  const { data } = await api.post('/in-cafe/orders', payload);
  return data;
}

export async function updatePayment(orderId: string, payload: {
  paymentStatus: string;
  paymentMethod?: string;
  paidAmount: number;
  voidReason?: string;
}) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/payment`, payload);
  return data;
}

export async function voidOrder(orderId: string, reason: string) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/void`, { reason });
  return data;
}

export async function fetchInCafeOrders(status?: string) {
  console.log('[API FETCH] fetchInCafeOrders called', { status });
  const params = status ? `?status=${status}` : '';
  const { data } = await api.get(`/in-cafe/orders${params}`);
  return data;
}

export async function editInCafeOrder(orderId: string, payload: {
  items: Array<{ productId: string; quantity: number; unitPrice?: number; notes?: string; selectedOptions?: Array<{ optionId: string; choiceLabel: string }> }>;
  notes?: string;
  reason?: string;
}) {
  const { data } = await api.put(`/in-cafe/orders/${orderId}/edit`, payload);
  return data;
}

export async function cancelInCafeOrder(orderId: string, reason: string) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/cancel`, { reason });
  return data;
}

export async function holdInCafeOrder(orderId: string, reason?: string) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/hold`, { reason });
  return data;
}

export async function resumeHeldInCafeOrder(orderId: string) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/resume`);
  return data;
}

export async function updateInCafeOrderNotes(orderId: string, notes: string) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/notes`, { notes });
  return data;
}

export async function assignCustomerToOrder(orderId: string, payload: {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
}) {
  const { data } = await api.patch(`/in-cafe/orders/${orderId}/assign-customer`, payload);
  return data;
}

export async function getInCafeOrderHistory(orderId: string) {
  const { data } = await api.get(`/in-cafe/orders/${orderId}/history`);
  return data;
}

export async function reprintInCafeReceipt(orderId: string) {
  const { data } = await api.get(`/in-cafe/orders/${orderId}/receipt`);
  return data;
}

export async function fetchKitchenOrders() {
  const { data } = await api.get('/in-cafe/kitchen/orders');
  return data;
}

// ── STAFF PURCHASES ──

export async function createStaffPurchase(payload: {
  staffId: string;
  productId: string;
  quantity: number;
  customPrice?: number;
  notes?: string;
}) {
  const { data } = await api.post('/staff-purchases', payload);
  return data;
}

export async function fetchStaffPurchases() {
  const { data } = await api.get('/staff-purchases');
  return data;
}

export async function fetchProducts() {
  const { data } = await api.get('/product-management/products');
  return data;
}

export async function fetchProductOptionsForPos(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/options`);
  return data as Array<{
    id: string; name: string; required: boolean; multiSelect: boolean;
    choices: Array<{ label: string; priceAdjust: number; ingredientImpacts?: Array<{ inventoryId: string; quantity: number; unit?: string }>; sortOrder: number }>;
    sortOrder: number;
  }>;
}

export async function fetchInventory() {
  const { data } = await api.get('/inventory');
  return data;
}

// ── PRODUCT MANAGEMENT (extended) ──

export async function fetchAllProducts(includeInactive = false) {
  const params = includeInactive ? '?includeInactive=true' : '';
  const { data } = await api.get(`/product-management/products${params}`);
  return data;
}

export async function fetchProductDetail(id: string) {
  const { data } = await api.get(`/product-management/products/${id}`);
  return data;
}

export async function createProduct(payload: {
  name: string;
  category?: string;
  categoryId?: string;
  description?: string;
  price: number;
  cost?: number;
  cafePrice?: number;
}) {
  const { data } = await api.post('/product-management/products', payload);
  return data;
}

export async function updateProduct(id: string, payload: {
  name?: string;
  category?: string;
  categoryId?: string;
  description?: string;
  price?: number;
  cost?: number;
  cafePrice?: number;
  active?: boolean;
}) {
  const { data } = await api.patch(`/product-management/products/${id}`, payload);
  return data;
}

export async function deactivateProduct(id: string) {
  const { data } = await api.delete(`/product-management/products/${id}`);
  return data;
}

export async function activateProduct(id: string) {
  const { data } = await api.post(`/product-management/products/${id}/activate`);
  return data;
}

export async function recalculateProductCost(id: string) {
  const { data } = await api.post(`/product-management/products/${id}/recalculate-cost`);
  return data;
}

export async function fetchRecipe(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/recipe`);
  return data;
}

export async function setRecipe(productId: string, ingredients: Array<{
  inventoryId: string;
  quantity: number;
  unit?: string;
  wastePercent?: number;
  emoji?: string;
  notes?: string;
}>) {
  const { data } = await api.put(`/product-management/products/${productId}/recipe`, ingredients);
  return data;
}

export async function fetchRecipeVersions(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/recipe-versions`);
  return data;
}

export async function fetchOptions(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/options`);
  return data;
}

export async function setOptions(productId: string, options: Array<{
  name: string;
  required?: boolean;
  multiSelect?: boolean;
  choices: Array<{
    label: string;
    priceAdjust?: number;
    ingredientImpacts?: Array<{ inventoryId: string; quantity: number }>;
    sortOrder?: number;
  }>;
  sortOrder?: number;
}>) {
  const { data } = await api.put(`/product-management/products/${productId}/options`, options);
  return data;
}

export async function fetchSizes(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/sizes`);
  return data;
}

export async function setSizes(productId: string, sizes: Array<{
  name: string; sortOrder?: number; priceAdjust?: number; costPercent?: number; active?: boolean;
}>) {
  const { data } = await api.put(`/product-management/products/${productId}/sizes`, sizes);
  return data;
}

export async function fetchAddOns(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/add-ons`);
  return data;
}

export async function setAddOns(productId: string, addOns: Array<{
  name: string; price: number; inventoryId: string; quantity: number; unit?: string; active?: boolean; sortOrder?: number;
}>) {
  const { data } = await api.put(`/product-management/products/${productId}/add-ons`, addOns);
  return data;
}

export async function fetchPackaging(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/packaging`);
  return data;
}

export async function setPackaging(productId: string, materials: Array<{
  name: string; inventoryId: string; quantity: number; unit?: string;
}>) {
  const { data } = await api.put(`/product-management/products/${productId}/packaging`, materials);
  return data;
}

export async function createCostSnapshot(productId: string, payload: { sellingPrice: number; orderItemId?: string; sizeName?: string }) {
  const { data } = await api.post(`/product-management/products/${productId}/cost-snapshot`, payload);
  return data;
}

export async function fetchCostSnapshots(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/cost-snapshots`);
  return data;
}

export async function fetchPriceHistory(productId: string) {
  const { data } = await api.get(`/product-management/products/${productId}/price-history`);
  return data;
}

export async function fetchCategories(includeInactive = false) {
  const params = includeInactive ? '?includeInactive=true' : '';
  const { data } = await api.get(`/product-management/categories${params}`);
  return data;
}

export async function createCategory(payload: {
  name: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}) {
  const { data } = await api.post('/product-management/categories', payload);
  return data;
}

export async function updateCategory(id: string, payload: {
  name?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  active?: boolean;
}) {
  const { data } = await api.patch(`/product-management/categories/${id}`, payload);
  return data;
}

export async function deleteCategory(id: string) {
  const { data } = await api.delete(`/product-management/categories/${id}`);
  return data;
}

// ── SMART FOLLOW-UP ──

export async function generateSuggestions() {
  const { data } = await api.post('/smart-followup/generate');
  return data;
}

export async function fetchSuggestions(status?: string, limit = 50, offset = 0) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const { data } = await api.get(`/smart-followup/suggestions?${params}`);
  return data;
}

export async function fetchSuggestionStats() {
  const { data } = await api.get('/smart-followup/suggestions/stats');
  return data;
}

export async function dismissSuggestion(id: string) {
  const { data } = await api.patch(`/smart-followup/suggestions/${id}/dismiss`);
  return data;
}

export async function markSuggestionSent(id: string) {
  const { data } = await api.patch(`/smart-followup/suggestions/${id}/send`);
  return data;
}

export async function updateSuggestionStatus(id: string, status: string, ownerEditedMessage?: string, ownerNote?: string) {
  const { data } = await api.patch(`/smart-followup/suggestions/${id}/status`, { status, ownerEditedMessage, ownerNote });
  return data;
}

export async function submitSuggestionFeedback(id: string, wasCorrect: boolean, ownerRating?: number, notes?: string) {
  const { data } = await api.post(`/smart-followup/suggestions/${id}/feedback`, { wasCorrect, ownerRating, notes });
  return data;
}

export async function fetchCustomerHabit(customerId: string) {
  const { data } = await api.get(`/smart-followup/habits/${customerId}`);
  return data;
}

export async function updateCustomerQuietHours(customerId: string, quietHourStart: number, quietHourEnd: number) {
  const { data } = await api.patch(`/smart-followup/habits/${customerId}/quiet-hours`, { quietHourStart, quietHourEnd });
  return data;
}

export async function toggleCustomerPause(customerId: string, isPaused: boolean) {
  const { data } = await api.patch(`/smart-followup/habits/${customerId}/pause`, { isPaused });
  return data;
}

export async function analyzeCustomer(customerId: string) {
  const { data } = await api.post(`/smart-followup/analyze/${customerId}`);
  return data;
}

// ── PAYMENT TRACKING ──

export async function collectPayment(orderId: string, payload: {
  paymentStatus: string;
  amountPaid?: number;
  method?: string;
  collectedById: string;
  collectedRole: 'BARISTA' | 'DRIVER';
  notes?: string;
}) {
  const { data } = await api.post('/payments/collect', { orderId, ...payload });
  return data;
}

export async function driverConfirmDelivery(payload: {
  orderId: string;
  driverId: string;
  deliveryStatus: 'DELIVERED' | 'FAILED';
  amountCollected?: number;
  notes?: string;
}) {
  const { data } = await api.post('/payments/driver-confirm', payload);
  return data;
}

export async function fetchUnpaidOrders() {
  const { data } = await api.get('/payments/unpaid-orders');
  return data;
}

export async function fetchPaymentLogs(orderId: string) {
  const { data } = await api.get(`/payments/logs/${orderId}`);
  return data;
}

export async function fetchBaristaClosing(baristaId: string, date?: string) {
  const params = date ? `?date=${date}` : '';
  const { data } = await api.get(`/payments/barista-closing/${baristaId}${params}`);
  return data;
}

export async function fetchDriverClosing(driverId: string, date?: string) {
  const params = date ? `?date=${date}` : '';
  const { data } = await api.get(`/payments/driver-closing/${driverId}${params}`);
  return data;
}

export async function fetchReconciliation(date?: string) {
  const params = date ? `?date=${date}` : '';
  const { data } = await api.get(`/payments/reconciliation${params}`);
  return data;
}

export async function fetchDebts(settled?: boolean) {
  const params = settled !== undefined ? `?settled=${settled}` : '';
  const { data } = await api.get(`/payments/debts${params}`);
  return data;
}

export async function fetchCustomerDebtSummary() {
  const { data } = await api.get('/in-cafe/debts/customer-summary');
  return data;
}

export async function fetchDebtOverview() {
  const { data } = await api.get('/payments/debt-overview');
  return data;
}

export async function settleDebt(debtId: string, settledById: string) {
  const { data } = await api.patch(`/payments/debts/${debtId}/settle`, { settledById });
  return data;
}

// ── PHASE 5: INVENTORY PURCHASES ──

export async function createInventoryPurchase(payload: {
  itemName: string;
  quantity: number;
  unit: string;
  cost?: number;
  supplier?: string;
  purchasedById?: string;
  inventoryItemId?: string;
  notes?: string;
}) {
  const { data } = await api.post('/inventory-purchases', payload);
  return data;
}

export async function fetchInventoryPurchases(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/inventory-purchases${qs ? `?${qs}` : ''}`);
  return data;
}

// ── INVENTORY WARNING & EXPENSE MANAGEMENT ──

export async function createInventoryItem(payload: {
  itemName: string;
  emoji?: string;
  unit: string;
  currentQty: number;
  minThreshold: number;
  costPerUnit: number;
}) {
  const { data } = await api.post('/inventory', payload);
  return data;
}

export async function updateInventoryItem(id: string, payload: {
  itemName?: string;
  unit?: string;
  currentQty?: number;
  minThreshold?: number;
  costPerUnit?: number;
}) {
  const { data } = await api.patch(`/inventory/${id}`, payload);
  return data;
}

export async function deleteInventoryItem(id: string) {
  await api.delete(`/inventory/${id}`);
}

export async function updateInventoryThreshold(id: string, minThreshold: number) {
  const { data } = await api.patch(`/inventory/${id}/threshold`, { minThreshold });
  return data;
}

export async function refillInventoryStock(id: string, payload: {
  quantity: number;
  cost?: number;
  supplier?: string;
  notes?: string;
  staffId?: string;
}) {
  const { data } = await api.post(`/inventory/${id}/refill`, payload);
  return data;
}

export async function fetchLowStockItems() {
  const { data } = await api.get('/inventory/low-stock');
  return data;
}

export async function fetchStockMovements(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/inventory/movements${qs ? `?${qs}` : ''}`);
  return data;
}

export async function fetchInventoryConsumption(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await api.get(`/inventory/consumption${params.toString() ? `?${params}` : ''}`);
  return data;
}

export async function fetchIngredientUsage(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await api.get(`/inventory/ingredient-usage${params.toString() ? `?${params}` : ''}`);
  return data;
}

export async function fetchMostConsumed(limit = 10, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', String(limit));
  const { data } = await api.get(`/inventory/most-consumed${params.toString() ? `?${params}` : ''}`);
  return data;
}

// ── EXPENSES ──

export async function createExpense(payload: {
  category: string;
  amount: number;
  description?: string;
  expenseDate?: string;
}) {
  const { data } = await api.post('/expenses', payload);
  return data;
}

export async function fetchExpenses(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/expenses${qs ? `?${qs}` : ''}`);
  return data;
}

export async function fetchDailyExpenses(date?: string) {
  const params = date ? `?date=${date}` : '';
  const { data } = await api.get(`/expenses/daily${params}`);
  return data;
}

export async function fetchWeeklyExpenses(date?: string) {
  const params = date ? `?date=${date}` : '';
  const { data } = await api.get(`/expenses/weekly${params}`);
  return data;
}

export async function fetchMonthlyExpenses(date?: string) {
  const params = date ? `?date=${date}` : '';
  const { data } = await api.get(`/expenses/monthly${params}`);
  return data;
}

// ── PHASE 6: AUTH ──

export async function loginWithCode(phone: string, code: string) {
  const { data } = await api.post('/auth/login', { phone, code });
  return data;
}

export async function refreshAccessToken() {
  const { data } = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  return data;
}

export async function logoutApi() {
  const { data } = await api.post('/auth/logout', {});
  return data;
}

export async function registerLoginCode(employeeId: string, code: string) {
  const { data } = await api.post('/auth/register-code', { employeeId, code });
  return data;
}

// ── PHASE 4: DRIVER SETTLEMENTS ──

export async function submitDriverSettlement(driverId: string, amount: number, notes?: string) {
  const { data } = await api.post('/drivers/settlement', { driverId, amount, notes });
  return data;
}

export async function fetchPendingSettlements() {
  const { data } = await api.get('/drivers/settlements/pending');
  return data;
}

export async function approveSettlement(id: string, approvedById: string) {
  const { data } = await api.patch(`/drivers/settlements/${id}/approve`, { approvedById });
  return data;
}

export async function rejectSettlement(id: string, reason: string) {
  const { data } = await api.patch(`/drivers/settlements/${id}/reject`, { reason });
  return data;
}

// ── PHASE 7: DRIVER FLOW ──

export async function assignDriverToOrder(driverId: string, orderId: string) {
  const { data } = await api.post(`/drivers/${driverId}/assign/${orderId}`);
  return data;
}

export async function completeDriverDelivery(driverId: string, orderId: string) {
  const { data } = await api.post(`/drivers/${driverId}/complete/${orderId}`);
  return data;
}

// ── NOTIFICATION API ──

export async function fetchNotifications(params?: {
  page?: number;
  limit?: number;
  type?: string;
  isRead?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.type) searchParams.set('type', params.type);
  if (params?.isRead !== undefined) searchParams.set('isRead', String(params.isRead));
  const qs = searchParams.toString();
  const { data } = await api.get(`/notifications${qs ? `?${qs}` : ''}`);
  return data;
}

export async function fetchUnreadCount() {
  const { data } = await api.get('/notifications/unread-count');
  return data;
}

export async function markNotificationRead(id: string) {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.patch('/notifications/read-all');
  return data;
}

export async function deleteNotification(id: string) {
  const { data } = await api.delete(`/notifications/${id}`);
  return data;
}

// ── REPORTS & ANALYTICS API ──

export async function generateReport(params: {
  type: string;
  dateRange?: { from: string; to: string };
  groupBy?: string;
  category?: string;
  status?: string;
  employee?: string;
  employeeRole?: string;
  format?: string;
}) {
  const { data } = await api.post('/reports/generate', params);
  return data;
}

export async function getReportStatus(jobId: string) {
  const { data } = await api.get(`/reports/${jobId}/status`);
  return data;
}

export async function getAvailableReports() {
  const { data } = await api.get('/reports/available');
  return data;
}

export async function getReportList(page: number = 1, limit: number = 20) {
  const { data } = await api.get(`/reports/list?page=${page}&limit=${limit}`);
  return data;
}

export async function deleteReport(reportId: string) {
  const { data } = await api.delete(`/reports/${reportId}`);
  return data;
}

export async function getAnalyticsKPIs(dateRange?: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (dateRange) params.set('dateRange', dateRange);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await api.get(`/analytics/kpis?${params.toString()}`);
  return data;
}

export async function getSalesTrend(groupBy?: string, dateRange?: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (groupBy) params.set('groupBy', groupBy);
  if (dateRange) params.set('dateRange', dateRange);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await api.get(`/analytics/charts/sales-trend?${params.toString()}`);
  return data;
}

export async function getOrderDistribution() {
  const { data } = await api.get('/analytics/charts/order-distribution');
  return data;
}

export async function getRevenueByCategory(limit: number = 10) {
  const { data } = await api.get(`/analytics/charts/revenue-by-category?limit=${limit}`);
  return data;
}

export async function getTopProducts(limit: number = 10) {
  const { data } = await api.get(`/analytics/charts/top-products?limit=${limit}`);
  return data;
}

export async function getPeakHours() {
  const { data } = await api.get('/analytics/charts/peak-hours');
  return data;
}

// ── ATTENDANCE & TIME TRACKING ──

export async function clockIn(staffId: string) {
  const { data } = await api.post('/attendance/clock-in', { staffId });
  return data;
}

export async function clockOut(staffId: string) {
  const { data } = await api.post('/attendance/clock-out', { staffId });
  return data;
}

export async function getActiveShift(staffId: string) {
  const { data } = await api.get(`/attendance/active/${staffId}`);
  return data;
}

export async function getAttendanceHistory(staffId: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/attendance/history/${staffId}${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getAttendanceSummary(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/attendance/summary${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getAllActiveShifts() {
  const { data } = await api.get('/attendance/active-shifts');
  return data;
}

// ── PRODUCT COSTING & PROFITABILITY ──

export async function getProductCostBreakdown(productId: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/product-management/products/${productId}/cost-breakdown${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getProductProfitability(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/product-management/profitability${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getDashboardProductProfitability(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data } = await api.get(`/dashboard/product-profitability${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getDashboardAttendanceSummary() {
  const { data } = await api.get('/dashboard/attendance-summary');
  return data;
}

// ── PLAYSTATION SESSION MANAGEMENT ──

export async function getPSDevices() {
  const { data } = await api.get('/playstation/devices');
  return data;
}

export async function getPSPricing() {
  const { data } = await api.get('/playstation/pricing');
  return data;
}

export async function getPSActiveSessions() {
  const { data } = await api.get('/playstation/sessions/active');
  return data;
}

export async function startPSSession(payload: {
  deviceId: string;
  customerName: string;
  sessionType: string;
  employeeId?: string;
}) {
  const { data } = await api.post('/playstation/sessions', payload);
  return data;
}

export async function getPSTimer(sessionId: string) {
  const { data } = await api.get(`/playstation/sessions/${sessionId}/timer`);
  return data;
}

export async function closePSSession(sessionId: string, paymentStatus: string) {
  const { data } = await api.patch(`/playstation/sessions/${sessionId}/close`, { paymentStatus });
  return data;
}

export async function collectPSPayment(sessionId: string) {
  const { data } = await api.patch(`/playstation/sessions/${sessionId}/collect`);
  return data;
}

export async function getPSHistory(dateFrom?: string, dateTo?: string, deviceId?: string, status?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (deviceId) params.set('deviceId', deviceId);
  if (status) params.set('status', status);
  const qs = params.toString();
  const { data } = await api.get(`/playstation/sessions/history${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getPSOwnerReport() {
  const { data } = await api.get('/playstation/reports/owner');
  return data;
}

// ─── Onboarding Wizard ──────────────────────────────────────────

export async function getOnboardingSession() {
  const { data } = await api.get('/onboarding/session');
  return data;
}

export async function saveOnboardingStep(step: number, data: any) {
  const { data: res } = await api.put('/onboarding/step', { step, data });
  return res;
}

export async function submitStep1(dto: any) {
  const { data } = await api.post('/onboarding/step/1', dto);
  return data;
}

export async function importMenuText(text: string) {
  const { data } = await api.post('/onboarding/import/menu', { text });
  return data;
}

export async function submitStep3(dto: any) {
  const { data } = await api.post('/onboarding/step/3', dto);
  return data;
}

export async function submitStep4(dto: any) {
  const { data } = await api.post('/onboarding/step/4', dto);
  return data;
}

export async function submitStep5(dto: any) {
  const { data } = await api.post('/onboarding/step/5', dto);
  return data;
}

export async function submitStep6(dto: any) {
  const { data } = await api.post('/onboarding/step/6', dto);
  return data;
}

export async function submitStep7(dto: any) {
  const { data } = await api.post('/onboarding/step/7', dto);
  return data;
}

export async function submitStep8(dto: any) {
  const { data } = await api.post('/onboarding/step/8', dto);
  return data;
}

export async function getReadinessReport() {
  const { data } = await api.get('/onboarding/readiness-report');
  return data;
}

export async function completeOnboarding() {
  const { data } = await api.post('/onboarding/complete');
  return data;
}

// ─── Generic Catalog ──────────────────────────────────────────

export async function listCatalog(params?: { tag?: string; categoryId?: string; search?: string }) {
  const { data } = await api.get('/product-management/catalog', { params });
  return data;
}

export async function getProductCatalog(id: string) {
  const { data } = await api.get(`/product-management/products/${id}/catalog`);
  return data;
}

export async function setProductImages(id: string, images: any[]) {
  const { data } = await api.put(`/product-management/products/${id}/images`, { images });
  return data;
}

export async function setProductAttributes(id: string, attributes: any[]) {
  const { data } = await api.put(`/product-management/products/${id}/attributes`, { attributes });
  return data;
}

export async function setProductTags(id: string, tags: string[]) {
  const { data } = await api.put(`/product-management/products/${id}/tags`, { tags });
  return data;
}

export async function setProductVariants(id: string, variants: any[]) {
  const { data } = await api.put(`/product-management/products/${id}/variants`, { variants });
  return data;
}

export async function setProductAvailability(id: string, availability: any) {
  const { data } = await api.put(`/product-management/products/${id}/availability`, { availability });
  return data;
}


export default api;
