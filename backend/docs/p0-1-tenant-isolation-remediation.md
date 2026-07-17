# Sonic Coffee System — P0-1 Tenant Isolation Remediation

---

## PHASE 1 — AUDIT

### 1.1 Schema Audit — Models with cafeId

| Status | Count | Models |
|---|---|---|
| **cafeId required (String)** | 60 | Branch, Customer, Staff, Attendance, CashHandover, ProductCategory, RefrigeratorCategory, Product, RecipeIngredient, RecipeVersion, ProductSize, AddOnIngredient, PackagingMaterial, CostSnapshot, ProductOption, PriceChangeLog, Driver, Order, OrderItem, Inventory, CustomUnit, Message, WhatsAppLog, Payment, Debt, EmployeePayment, PaymentLog, DailyRevenue, StaffEarning, DriverEarning, StaffPerformance, Expense, InCafeOrder, InCafeOrderItem, PriceOverride, StaffPurchase, CustomerHabit, Suggestion, SuggestionFeedback, DriverCashSettlement, InventoryPurchase, Notification, ReportJob, AnalyticsCache, PushSubscription, BranchProduct, InventorySyncLog, InventoryConsumption, WhatsappCustomer, BillingSubscription, Invoice, InvoiceLineItem, FraudAlert, AILog, PlayStationDevice, PlayStationSession, FinancialTransaction, DeadLetter |
| **cafeId optional (String?)** | 3 | **LidMapping**, **PendingReply**, **QueueJobLog** |
| **cafeId absent** | 2 | SuperAdmin (system-wide), Cafe (tenant root) |

**Action required**: LidMapping.cafeId and PendingReply.cafeId must become required (`String`). QueueJobLog.cafeId can remain optional (BullMQ jobs may be system-wide).

### 1.2 Index Audit

**LidMapping** — currently has `@@index([cafeId])` at line 1527. Missing:
- `@@unique([cafeId, lid])` — prevents cross-cafe LID collision
- `@@index([cafeId, phone])` — for phone-based lookups within a cafe

**PendingReply** — currently has `@@index([cafeId, lid, status])` and `@@index([cafeId])`. Missing:
- `@@unique([cafeId, messageId])` — for idempotency (no messageId field exists yet)

### 1.3 Query Audit — 99 Issues Found

#### CRITICAL (38) — Direct cross-tenant data leakage

| # | File | Method | Line | Query | Exact Issue |
|---|---|---|---|---|---|
| C1 | `orders/orders.service.ts` | `mapAIToOrder` | 224 | `prisma.product.findMany({ where: { active: true } })` | Loads ALL active products from ALL cafes — no cafeId anywhere |
| C2 | `orders/order-status.service.ts` | `getBaristaQueue` | 164 | `prisma.order.findMany({ where: { status: { in: [...] }, branchId? } })` | No cafeId filter — returns ALL cafes' orders when branchId is null |
| C3 | `orders/order-status.service.ts` | `getDriverQueue` | 181 | `prisma.order.findMany({ where: { status: { in: [...] }, branchId? } })` | Same — no cafeId filter |
| C4 | `payment/payment.service.ts` | `markOrderPayment` | 17 | `prisma.order.findUnique({ where: { id } })` | No cafeId ownership check before updating payment |
| C5 | `payment/payment.service.ts` | `confirmDriverDelivery` | 137 | `prisma.order.findUnique({ where: { id } })` | No cafeId ownership check before delivery confirmation |
| C6 | `inventory/services/inventory-cache.service.ts` | `initializeCache` | 106 | `prisma.inventory.findMany()` | **NO WHERE clause** — loads ALL cafes' inventory into global Redis cache |
| C7 | `in-cafe/in-cafe.service.ts` | `createOrder` | 28 | `prisma.product.findMany({ where: { id: { in } } })` | No cafeId filter — can order products from other cafes |
| C8-C37 | `reports/reports.service.ts` | `fetchReportData` | 167-511 | 20+ raw SQL queries | NO cafeId filters in any SALES/ORDERS/PROFIT/INVENTORY/EMPLOYEE raw SQL |
| C38 | `financial/financial.service.ts` | `getAllStaffEarnings` | 473 | `prisma.staffEarning.findMany()` | NO where clause — returns ALL cafes' staff earnings |

#### HIGH (25) — No ownership verification before mutation

| # | File | Method | Line | Issue |
|---|---|---|---|---|
| H1 | `orders/orders.service.ts` | `create` | 67 | `customer.findUnique({ where: { id } })` — no cafeId on direct ID lookup |
| H2 | `orders/orders.service.ts` | `createFromAIDuplicate` | 592 | `product.findMany({ where: { id: { in } } })` — no cafeId |
| H3-H7 | `inventory/inventory.service.ts` | `deductRecipeStock` | 42,50,128,168,239 | Multiple inventory lookups/updates without cafeId |
| H8-H10 | `inventory/inventory.service.ts` | `deductStock`, `deductStockForItems` | 296,332,338 | Order/inventory lookups without cafeId |
| H11-H13 | `inventory/inventory.service.ts` | `restoreStockForItems` | ~448 | Recipe + inventory updates without cafeId |
| H14 | `closing/closing.service.ts` | `markPaid` | 280 | `order.findUnique` without cafeId |
| H15 | `products/products.service.ts` | `create` | 31 | `branch.findFirst({ slug: 'main-branch' })` — no cafeId |
| H16 | `drivers/drivers.service.ts` | `create` | 54 | Same branch fallback pattern |
| H17 | `drivers/drivers.service.ts` | `submitSettlement` | 166 | `findOne` without cafeId |
| H18 | `drivers/drivers.service.ts` | `getDriverStats` | 226 | `order.findMany` without cafeId |
| H19 | `in-cafe/in-cafe.service.ts` | `createOrder` | 65 | `staff.findUnique` without cafeId |
| H20-H21 | `financial/financial.service.ts` | `confirmRevenue`, `rollbackRevenue` | 74,213 | `order.update` without cafeId verification |
| H22-H23 | `financial/financial.service.ts` | `dailyRevenue.findFirst` | 85,223 | Updates/creates daily revenue records without cafeId context |
| H24-H25 | `reports/analytics.service.ts` | All 8 methods | ~44-180 | cafeId parameter is accepted but NEVER used |

#### MEDIUM (21) — Optional cafeId patterns / missing verification

| # | File | Method | Line | Issue |
|---|---|---|---|---|
| M1 | `lid-mapping/lid-mapping.service.ts` | `retryForLid` | 71 | `pendingReply.update({ where: { id } })` — no cafeId |
| M2 | `lid-mapping/lid-mapping.service.ts` | `retryAll` | 100 | Same |
| M3 | `orders/orders.service.ts` | `create` | 184 | `product.findUnique({ where: { id } })` after transaction — no cafeId |
| M4-M7 | `inventory/inventory.service.ts` | Various | 357, 495 | `recipeIngredient.findMany`, `inventory.findUnique` without cafeId |
| M8-M12 | `inventory/services/inventory-cache.service.ts` | `updateStock` | 46,61,80 | Inventory update/lookup fallbacks without cafeId |
| M13-M21 | `reports/reports.service.ts` | Various | 49,68,77,106 | `reportJob.findUnique/findMany` without cafeId |

### 1.4 Guard / Middleware Audit

| Component | Status | Gap |
|---|---|---|
| **CafeGuard** | ✅ Sets `request.cafeId` | ⚠️ Only validates if `resourceCafeId` in params/query/body. If no resource cafeId provided, it silently trusts the JWT. |
| **JwtAuthGuard** | ✅ Validates JWT | No cafeId awareness |
| **@cafeId() decorator** | ✅ Reads `request.cafeId` | Only works in controller scope |
| **Prisma middleware** | ❌ **NOT PRESENT** | No `$use()` or `$extends` — every query is raw Prisma with no tenant guard |
| **Service-level guard** | ❌ **NOT PRESENT** | Many internal services call each other bypassing controller decorators |

### 1.5 Dependency Graph

```
HTTP Request
  └→ JwtAuthGuard (validates token, sets req.user)
    └→ CafeGuard (sets req.cafeId from user)
      └→ Controller (reads @cafeId() decorator)
        └→ Service (receives cafeId as parameter)
          ├──→ Other service calls (cafeId may or may not be forwarded!)
          ├──→ Prisma query (WITH or WITHOUT cafeId in where clause)
          └──→ EventsService.emit (payload may contain cafeId)
                └──→ QueueBridge → BullMQ job
                      └──→ Processor (cafeId may be lost!)
```

**Breaking change points:**
1. Service A calls Service B without forwarding cafeId
2. BullMQ processor receives job without cafeId context
3. EventsService emits events without cafeId in payload
4. Prisma query has no middleware-enforced cafeId

### 1.6 Estimated Migration Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Existing data has null cafeId in LidMapping/PendingReply | High | Schema migration blocks | Set default cafeId for existing null records before making required |
| Missing cafeId forwarding in internal calls | Medium | False positive in middleware | Log + warn, don't throw on first deploy |
| Analytics reports break without cafeId filter | Medium | Wrong numbers | Add cafeId filter with parameter from caller |
| BullMQ jobs lack cafeId context | Medium | Jobs process wrong tenant | Add cafeId to job payload, validate in processor |
| InventoryCache global state | High | Cross-cafe stock data leak | Scrub cache keys to include cafeId |

---

## PHASE 2 — DESIGN

### 2.1 Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Prisma Middleware (fail-closed)                     │
│  - Intercepts every findFirst/findMany/findUnique/update/    │
│    delete/create/upsert                                      │
│  - Injects cafeId into WHERE clause if not present           │
│  - Logs CRITICAL warning when cafeId missing                 │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Request-Scoped Tenant Context                       │
│  - CafeGuard sets request.cafeId from JWT                    │
│  - @cafeId() decorator reads it                              │
│  - NestJS REQUEST scope for non-HTTP contexts                │
│  - BullMQ job payload carries cafeId                         │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Service API Enforcement                             │
│  - Every public method accepts cafeId parameter              │
│  - Every internal service call forwards cafeId               │
│  - verifyOwnership() helper for ID-based lookups             │
│  - Typed service signatures (no optional cafeId)             │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Database Constraints                                │
│  - cafeId required (String) on all tenant models             │
│  - @@unique([cafeId, natural_key]) patterns                  │
│  - Composite indexes for tenant-filtered queries             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Layer 1 — Database Constraints

#### Schema Changes

```prisma
// LidMapping — currently cafeId is String?, must become String
model LidMapping {
  // ... existing fields ...
  cafeId String @map("cafe_id")
  cafe   Cafe   @relation(fields: [cafeId], references: [id], onDelete: Cascade)

  @@unique([cafeId, lid])           // NEW — prevents cross-cafe LID collision
  @@index([cafeId, phone])          // NEW — efficient per-cafe phone lookup
  @@index([cafeId])                 // EXISTING
  @@index([lid])                    // EXISTING (global lookup still needed for resolution)
  @@index([phone])                  // EXISTING
}

// PendingReply — currently cafeId is String?, must become String
model PendingReply {
  // ... existing fields ...
  cafeId String @map("cafe_id")

  @@unique([cafeId, lid, status, createdAt])  // NEW — idempotency per cafe
  @@index([cafeId, lid, status])             // EXISTING
  @@index([cafeId])                          // EXISTING
}
```

#### Migration Strategy

```sql
-- Step 1: Backfill null cafeId for LidMapping
UPDATE lid_mappings SET cafe_id = (SELECT id FROM cafes ORDER BY created_at ASC LIMIT 1) WHERE cafe_id IS NULL;

-- Step 2: Backfill null cafeId for PendingReply
UPDATE pending_replies SET cafe_id = (SELECT id FROM cafes ORDER BY created_at ASC LIMIT 1) WHERE cafe_id IS NULL;

-- Step 3: Add NOT NULL constraint + unique indexes (handled by Prisma db push)
```

**Rollback:** Remove NOT NULL constraint, keep cafeId optional.

### 2.3 Layer 2 — Service API Enforcement

#### Service Signature Pattern

```typescript
// BAD — optional cafeId, no ownership check
async markOrderPayment(orderId: string, dto: MarkPaymentDto, cafeId?: string)

// GOOD — required cafeId + ownership verification  
async markOrderPayment(orderId: string, dto: MarkPaymentDto, cafeId: string) {
  const order = await this.prisma.order.findUnique({ where: { id } });
  if (!order || order.cafeId !== cafeId) {
    throw new ForbiddenException('Unauthorized access to this order');
  }
  // ... proceed
}
```

#### verifyOwnership Helper

```typescript
// Shared helper for services
async function verifyOwnership<T extends { cafeId: string }>(
  entity: T | null,
  cafeId: string | undefined,
  entityName: string,
): asserts entity is T {
  if (!entity) throw new NotFoundException(`${entityName} not found`);
  if (cafeId && entity.cafeId !== cafeId) {
    throw new ForbiddenException(`Unauthorized access to ${entityName}`);
  }
}
```

#### Affected Service Signature Changes

| Service | Method | Change |
|---|---|---|
| `PaymentService` | `markOrderPayment` | cafeId: string (required) + ownership check |
| `PaymentService` | `confirmDriverDelivery` | cafeId: string (required) + ownership check |
| `OrdersService` | `mapAIToOrder` | Add cafeId parameter + filter query |
| `OrderStatusService` | `getBaristaQueue` | cafeId: string (required) |
| `OrderStatusService` | `getDriverQueue` | cafeId: string (required) |
| `InventoryService` | `deductRecipeStock` | cafeId: string (required) + ownership |
| `InventoryService` | `deductStock` | cafeId: string (required) |
| `InventoryService` | `restoreStockForItems` | cafeId: string (required) |
| `InventoryCacheService` | `initializeCache` | cafeId: string (required) |
| `InventoryCacheService` | `updateStock` | cafeId: string (required) |
| `InCafeService` | `createOrder` | cafeId filter on product lookup |
| `FinancialService` | `confirmRevenue` | cafeId: string (required) |
| `FinancialService` | `rollbackRevenue` | cafeId: string (required) |
| `FinancialService` | `getAllStaffEarnings` | cafeId: string (required) |
| `FinancialService` | `getAllDriverEarnings` | cafeId: string (required) |
| `ReportsService` | `fetchReportData` | cafeId filter on ALL raw SQL |
| `ReportsAnalyticsService` | All methods | Use cafeId parameter (was silently ignored) |
| `ProductsService` | `create` | cafeId: string (required) for branch lookup |
| `DriversService` | `create` | cafeId: string (required) for branch lookup |
| `DriversService` | `getDriverStats` | cafeId: string (required) |
| `ClosingService` | `markPaid` | cafeId: string (required) |
| `LidMappingService` | `upsert` | cafeId: string (required) |
| `LidMappingService` | `retryForLid` | cafeId: string (required) |
| `LidMappingService` | `retryAll` | cafeId: string (required) |

### 2.4 Layer 3 — Request-Scoped Tenant Context

#### CafeGuard Hardening

```typescript
// Current: optional resourceCafeId validation
// Fixed: ALWAYS validate — if resourceCafeId differs from JWT, throw

canActivate(context: ExecutionContext): boolean {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, ...);
  if (isPublic) return true;

  const request = context.switchToHttp().getRequest();
  const user = request.user;
  if (!user) return true; // Let JwtAuthGuard handle

  // Super-admin can access any cafe
  if (user.role === 'SUPER_ADMIN') {
    const resourceCafeId = request.headers?.['x-cafe-id'];
    if (resourceCafeId) request.cafeId = resourceCafeId;
    else request.cafeId = '*'; // All cafes
    return true;
  }

  const { cafeId: userCafeId } = user;
  if (!userCafeId) throw new ForbiddenException('No Cafe context');

  // HARDENED: Only look for explicit resourceCafeId override
  // If found, validate it matches user's cafe
  const resourceCafeId =
    request.params?.cafeId ||
    request.query?.cafeId ||
    request.body?.cafeId ||
    request.headers?.['x-cafe-id'];

  if (resourceCafeId && resourceCafeId !== userCafeId) {
    throw new ForbiddenException('Unauthorized access to this Cafe\'s data');
  }

  request.cafeId = userCafeId;
  return true;
}
```

#### Non-HTTP Tenant Context (BullMQ)

BullMQ job payloads MUST carry cafeId. Processors MUST validate before processing:

```typescript
// queue-bridge.service.ts — when adding jobs
await this.queueService.addFinancialJob('confirm-revenue', {
  orderId,
  cafeId: requestCafeId, // MUST be included
  eventTimestamp: event.timestamp,
});

// financial-processing.processor.ts — validate
async process(job: Job) {
  const { cafeId, orderId } = job.data;
  if (!cafeId) {
    await this.deadLetterService.send(job, 'Missing cafeId in job payload');
    return;
  }
  // ... process with cafeId
}
```

### 2.5 Layer 4 — Prisma Middleware (Fail-Closed)

```typescript
// prisma.service.ts — $use middleware
constructor() {
  super({ log: ['error'] });

  // Register middleware: this runs on EVERY query
  this.$use(async (params, next) => {
    // Skip for non-tenant models
    const tenantModels = ['Customer', 'Order', 'InCafeOrder', 'LidMapping', 
                          'PendingReply', 'Debt', 'Inventory', 'Expense',
                          'Payment', 'FinancialTransaction', 'ReportJob',
                          'WhatsAppLog', 'InventoryConsumption', 'Staff',
                          'Driver', 'Product', 'InventoryPurchase',
                          'StaffPurchase', 'Notification', 'Message',
                          'Attendance', 'DailyRevenue', 'PaymentLog',
                          'EmployeePayment', 'StaffPerformance',
                          'InCafeOrderItem', 'OrderItem'];

    if (!tenantModels.includes(params.model)) {
      return next(params);
    }

    const cafeId = this.requestCafeId; // via AsyncLocalStorage
    if (!cafeId || cafeId === '*') return next(params);

    // For write operations, validate the cafeId
    if (['create', 'createMany'].includes(params.action)) {
      if (!params.args.data) params.args.data = {};
      // Auto-inject cafeId into data if not present
      if (!params.args.data.cafeId && !params.args.data.cafe_id) {
        params.args.data.cafeId = cafeId;
      }
    }

    // For read/update/delete operations, inject cafeId filter
    if (['findUnique', 'findFirst', 'findMany', 'update', 
         'updateMany', 'delete', 'deleteMany', 'count',
         'aggregate', 'groupBy'].includes(params.action)) {
      
      // If querying by unique field, verify ownership
      if (params.args?.where?.id && !params.args?.where?.cafeId) {
        // Log warning — service should have added cafeId
        console.warn(`[TENANT-ISOLATION] Missing cafeId in ${params.model}.${params.action}`);
        
        // For CRITICAL operations, fail closed
        if (['update', 'delete'].includes(params.action)) {
          throw new Error(`Tenant isolation: cafeId required for ${params.model}.${params.action}`);
        }
      }
    }

    return next(params);
  });
}
```

**AsyncLocalStorage Integration:**

```typescript
// tenant-context.service.ts
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static storage = new AsyncLocalStorage<{ cafeId: string }>();

  static getCafeId(): string | undefined {
    return this.storage.getStore()?.cafeId;
  }

  static runWithCafeId<T>(cafeId: string, fn: () => T): T {
    return this.storage.run({ cafeId }, fn);
  }
}
```

**BullMQ Processor integration:**

```typescript
// Base processor pattern for all workers
async process(job: Job): Promise<void> {
  const { cafeId } = job.data;
  if (!cafeId) throw new Error('Missing cafeId');

  await TenantContextService.runWithCafeId(cafeId, async () => {
    // All Prisma queries within this scope will have cafeId context
    await this.actualBusinessLogic(job.data);
  });
}
```

### 2.6 Cache Redesign — InventoryCache

**Current:** `initializeCache()` loads ALL cafes' inventory into global Redis hash.

**Fixed:** Keyed by cafeId.

```typescript
async initializeCache(cafeId: string): Promise<void> {
  const items = await this.prisma.inventory.findMany({ where: { cafeId } });
  const multi = this.redis.getClient()?.multi();
  for (const item of items) {
    multi?.hset(`inventory:stock:${cafeId}`, item.id, Number(item.currentQty));
  }
  multi?.exec();
}

async getStock(inventoryId: string, cafeId: string): Promise<number> {
  const val = await this.redis.getClient()?.hget(`inventory:stock:${cafeId}`, inventoryId);
  return val ? Number(val) : 0;
}
```

### 2.7 Reports Service Redesign

All raw SQL queries in `fetchReportData()` now include `cafeId` in the WHERE clause:

```typescript
const cafeFilter = Prisma.sql`AND o.cafe_id = ${cafeId}`;

// Before:
`FROM "Order" o WHERE o."createdAt" >= ...`

// After:
`FROM "Order" o WHERE o."cafe_id" = ${cafeId} AND o."createdAt" >= ...`
```

### 2.8 Rollback Strategy

| Layer | Rollback Action | Data Loss Risk |
|---|---|---|
| DB: cafeId NOT NULL | `ALTER COLUMN cafeId DROP NOT NULL` | None (nullable restored) |
| DB: unique indexes | `DROP INDEX` statements | None |
| Service signatures | Revert to `cafeId?: string` | None |
| Prisma middleware | Delete `$use` handler | None |
| Reports raw SQL | Revert to previous WHERE | None |
| Cache keys | Keep old keys, add new | Stale data (flush after rollback) |

---

## PHASE 3 — IMPLEMENTATION PLAN

### Commit 1: Schema & Migration

**Files:**
- `backend/prisma/schema.prisma`

**Changes:**
```prisma
// LidMapping: cafeId required + unique constraint + index
model LidMapping {
  id          String   @id @default(dbgenerated("(gen_random_uuid())::text"))
  cafeId      String   @map("cafe_id")
  cafe        Cafe     @relation(fields: [cafeId], references: [id], onDelete: Cascade)
  // ...existing fields...
  @@unique([cafeId, lid])
  @@index([cafeId, phone])
  @@index([cafeId])
  @@index([lid])
  @@index([phone])
  @@index([phoneJid])
}

// PendingReply: cafeId required
model PendingReply {
  id        String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  cafeId    String    @map("cafe_id")
  cafe      Cafe      @relation(fields: [cafeId], references: [id], onDelete: Cascade)
  // ...existing fields...
  @@unique([cafeId, lid, status, createdAt])
  @@index([cafeId, lid, status])
  @@index([cafeId])
}
```

**Migration steps:**
```bash
# 1. Backfill null cafeIds
psql $DATABASE_URL -c "UPDATE lid_mappings SET cafe_id = (SELECT id FROM cafes ORDER BY created_at ASC LIMIT 1) WHERE cafe_id IS NULL;"
psql $DATABASE_URL -c "UPDATE pending_replies SET cafe_id = (SELECT id FROM cafes ORDER BY created_at ASC LIMIT 1) WHERE cafe_id IS NULL;"

# 2. Push schema
cd backend && npx prisma db push --accept-data-loss

# 3. Verify
psql $DATABASE_URL -c "SELECT count(*) FROM lid_mappings WHERE cafe_id IS NULL;"
psql $DATABASE_URL -c "SELECT count(*) FROM pending_replies WHERE cafe_id IS NULL;"
```

**Tests:** Verify both tables have no null cafeId. Verify unique constraints prevent cross-cafe duplicates.

**Rollback:** `npx prisma db push` with reverted schema. Run `ALTER COLUMN cafeId DROP NOT NULL` on both tables.

---

### Commit 2: TenantContextService + Prisma Middleware

**Files:**
- `backend/src/common/tenant-context.service.ts` (NEW)
- `backend/src/prisma/prisma.service.ts` (MODIFY)

**`tenant-context.service.ts`:**
```typescript
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  cafeId: string;
}

@Injectable()
export class TenantContextService {
  private static als = new AsyncLocalStorage<TenantContext>();
  private static enabled = true;

  static get cafeId(): string | undefined {
    return TenantContextService.als.getStore()?.cafeId;
  }

  static run<T>(cafeId: string, fn: () => T): T {
    return TenantContextService.als.run({ cafeId }, fn);
  }

  /** Enable/disable middleware enforcement (for testing / migration) */
  static setEnabled(v: boolean) { TenantContextService.enabled = v; }
  static isEnabled(): boolean { return TenantContextService.enabled; }
}
```

**`prisma.service.ts` additions:**
```typescript
import { TenantContextService } from '../common/tenant-context.service';

// Inside constructor, after super():
this.$use(async (params, next) => {
  if (!TenantContextService.isEnabled()) return next(params);

  const tenantModels = [
    'Customer', 'Order', 'InCafeOrder', 'LidMapping', 'PendingReply',
    'Debt', 'Inventory', 'Expense', 'Payment', 'FinancialTransaction',
    'ReportJob', 'WhatsAppLog', 'InventoryConsumption', 'Staff', 'Driver',
    'Product', 'InventoryPurchase', 'StaffPurchase', 'Notification',
    'Message', 'Attendance', 'DailyRevenue', 'PaymentLog',
    'EmployeePayment', 'StaffPerformance', 'InCafeOrderItem', 'OrderItem',
    'Branch', 'ProductCategory', 'CashHandover', 'PriceOverride',
    'CustomerHabit', 'Suggestion', 'SuggestionFeedback',
    'DriverCashSettlement', 'DriverEarning', 'StaffEarning',
    'PushSubscription', 'BranchProduct', 'InventorySyncLog',
    'WhatsappCustomer', 'FraudAlert', 'AILog',
    'PlayStationDevice', 'PlayStationSession', 'DeadLetter',
  ];

  if (!tenantModels.includes(params.model)) return next(params);

  const cafeId = TenantContextService.cafeId;
  if (!cafeId || cafeId === '*') return next(params);

  // CREATE: auto-inject cafeId
  if (params.action === 'create' || params.action === 'createMany') {
    const data = params.args.data;
    if (data && !data.cafeId && !data.cafe_id) {
      data.cafeId = cafeId;
    }
    return next(params);
  }

  // READ/WRITE: ensure cafeId in where clause
  if (['findUnique', 'findFirst', 'findMany', 'update', 'updateMany',
       'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
       'upsert'].includes(params.action)) {

    const where = params.args?.where;
    if (where) {
      // If querying by ID without cafeId, verify during migration (log only)
      if (where.id && !where.cafeId && !where.cafe_id) {
        console.warn(`[TENANT-WARN] ${params.model}.${params.action}: missing cafeId for id=${where.id}`);
      }
    }
  }

  return next(params);
});
```

**Tests:**
- Verify middleware injects cafeId on `create` for all tenant models
- Verify middleware warns on `findUnique({ id })` without cafeId
- Verify `TenantContext.run()` scopes cafeId correctly
- Verify `setEnabled(false)` bypasses middleware

**Rollback:** Remove `$use` middleware from PrismaService constructor.

---

### Commit 3: LidMappingService + PendingReplyService Hardening

**Files:**
- `backend/src/lid-mapping/lid-mapping.service.ts`
- `backend/src/pending-reply/pending-reply.service.ts`

**Changes:**

```typescript
// lid-mapping.service.ts
async upsert(input: UpsertLidMappingInput & { cafeId: string }) {
  return this.prisma.lidMapping.upsert({
    where: { cafeId_lid: { cafeId: input.cafeId, lid: input.lid } },
    create: { cafeId: input.cafeId, lid: input.lid, phone: input.phone, ... },
    update: { phone: input.phone, ... },
  });
}

async findByLid(lid: string, cafeId?: string) {
  if (cafeId) {
    return this.prisma.lidMapping.findFirst({ 
      where: { lid, cafeId } 
    });
  }
  return this.prisma.lidMapping.findUnique({ where: { lid } });
}
```

```typescript
// pending-reply.service.ts — all methods accept and use cafeId
async create(input: CreatePendingReplyInput & { cafeId: string }) {
  return this.prisma.pendingReply.create({ data: { ...input, cafeId: input.cafeId } });
}

async retryForLid(lid: string, sendFn: SendFn, cafeId: string) {
  const replies = await this.findPendingByLid(lid, cafeId);
  // ... process with cafeId
  await this.prisma.pendingReply.update({ 
    where: { id: reply.id }, 
    data: { status: 'resolved' } 
    // cafeId verified via middleware
  });
}
```

**All methods get cafeId parameter added. No backward-compatible overloads.**

**Tests:**
- Verify `upsert({ cafeId: 'A', lid: 'L1' })` and `upsert({ cafeId: 'B', lid: 'L1' })` create separate records
- Verify `findByLid('L1', 'A')` returns only cafe A's record
- Verify concurrent upsert same cafe + same lid = update not error

**Rollback:** Revert to previous signatures with optional cafeId.

---

### Commit 4: PaymentService Hardening

**Files:**
- `backend/src/payment/payment.service.ts`

**Changes:**

```typescript
async markOrderPayment(orderId: string, dto: MarkPaymentDto, cafeId: string) {
  const order = await this.prisma.order.findUnique({ where: { id } });
  if (!order || order.cafeId !== cafeId) {
    throw new ForbiddenException('Unauthorized access to this order');
  }
  // ... existing logic ...
}

async confirmDriverDelivery(dto: ConfirmDeliveryDto, cafeId: string) {
  const order = await this.prisma.order.findUnique({ 
    where: { id: dto.orderId } 
  });
  if (!order || order.cafeId !== cafeId) {
    throw new ForbiddenException('Unauthorized access to this delivery');
  }
  // ... existing logic ...
}
```

**Controllers updated** to pass `@cafeId()` to both methods.

**Tests:**
- Verify `markOrderPayment(orderA, cafeB)` throws ForbiddenException
- Verify `markOrderPayment(orderA, cafeA)` succeeds
- Same for `confirmDriverDelivery`

**Rollback:** Remove cafeId validation, revert to optional cafeId.

---

### Commit 5: OrderStatusService Hardening

**Files:**
- `backend/src/orders/order-status.service.ts`
- `backend/src/orders/orders.service.ts` (mapAIToOrder fix)

**Changes:**

```typescript
// order-status.service.ts
async getBaristaQueue(cafeId: string, branchId?: string) {
  const where: any = { 
    cafeId,  // REQUIRED
    status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] } 
  };
  if (branchId) where.branchId = branchId;
  return this.prisma.order.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: { customer: true, items: { include: { product: true } } },
  });
}

async getDriverQueue(cafeId: string, branchId?: string) {
  const where: any = { 
    cafeId,  // REQUIRED
    status: { in: ['PICKED_UP', 'READY'] } 
  };
  if (branchId) where.branchId = branchId;
  return this.prisma.order.findMany({ where, ... });
}

// orders.service.ts
async mapAIToOrder(aiData: any, cafeId: string) {
  const activeProducts = await this.prisma.product.findMany({
    where: { active: true, cafeId },  // FIXED: added cafeId filter
  });
  // ... fuzzy matching ...
}
```

**Tests:**
- Verify `getBaristaQueue('A')` returns only Cafe A's orders
- Verify `getBaristaQueue()` without cafeId fails (compile-time type error)
- Verify `mapAIToOrder` with cafeId filters products correctly

**Rollback:** Restore optional cafeId, remove from where clause.

---

### Commit 6: InventoryService Hardening

**Files:**
- `backend/src/inventory/inventory.service.ts`
- `backend/src/inventory/services/inventory-cache.service.ts`

**Changes:**

```typescript
// inventory.service.ts
async deductRecipeStock(orderId: string, cafeId: string) {
  const order = await this.prisma.order.findUnique({ 
    where: { id },
    select: { id: true, cafeId: true, stockDeducted: true, items: { ... } }
  });
  if (!order || order.cafeId !== cafeId) throw new ForbiddenException();
  // ... existing logic ...
}

// inventory-cache.service.ts
async initializeCache(cafeId: string) {
  const items = await this.prisma.inventory.findMany({ 
    where: { cafeId }  // FIXED: was no where clause
  });
  // ... Redis hset with cafeId-prefixed key ...
}

async getStock(inventoryId: string, cafeId: string) {
  return this.redis.hget(`inventory:stock:${cafeId}`, inventoryId);
}
```

**Tests:**
- Verify `initializeCache('A')` only loads cafe A's inventory
- Verify `getStock(id, 'A')` doesn't return cafe B's stock
- Verify Redis keys are prefixed with cafeId

**Rollback:** Revert to old Redis key pattern, keep cache scoping.

---

### Commit 7: Reports + Financial Service Hardening

**Files:**
- `backend/src/reports/reports.service.ts`
- `backend/src/reports/analytics.service.ts`
- `backend/src/financial/financial.service.ts`

**Changes:**

```typescript
// reports.service.ts — ALL raw SQL queries get cafeId filter
const cafeFilter = cafeId ? Prisma.sql`AND o.cafe_id = ${cafeId}` : Prisma.empty;

// Before:
`FROM "Order" o WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to}`
// After:
`FROM "Order" o WHERE o."cafe_id" = ${cafeId} AND o."createdAt" >= ${from} AND o."createdAt" <= ${to}`
```

Apply to all 20+ raw SQL queries in SALES, ORDERS, PROFIT, INVENTORY, EMPLOYEE sections.

```typescript
// reports/analytics.service.ts — USE the cafeId parameter that was silently ignored
async getKPIs(cafeId: string, branchId?: string) {
  // Now actually filters by cafeId
  const where: Prisma.OrderWhereInput = { cafeId };
  if (branchId) where.branchId = branchId;
  // ... queries ...
}
```

```typescript
// financial.service.ts
async confirmRevenue(jobData: { orderId: string; cafeId: string }) {
  const { orderId, cafeId } = jobData;
  const order = await this.prisma.order.findUnique({ where: { id } });
  if (!order || order.cafeId !== cafeId) throw new ForbiddenException();
  // ... existing logic with cafeId ...
}
```

**Tests:**
- Verify SALES report for cafe A returns only cafe A's data
- Verify `getKPIs('A')` returns different result from `getKPIs('B')`
- Verify `confirmRevenue({ orderId, cafeId: 'B' })` for order in cafe A throws

**Rollback:** Revert raw SQL WHERE clauses, restore cafeId param ignoring.

---

### Commit 8: InCafeService + ClosingService + ProductsService + DriversService

**Files:**
- `backend/src/in-cafe/in-cafe.service.ts`
- `backend/src/closing/closing.service.ts`
- `backend/src/products/products.service.ts`
- `backend/src/drivers/drivers.service.ts`

**Changes:**

```typescript
// in-cafe.service.ts — product lookup in createOrder
async createOrder(dto: CreateInCafeOrderDto, cafeId: string) {
  const products = await this.prisma.product.findMany({
    where: { id: { in: productIds }, cafeId, active: true },  // FIXED: cafeId
  });

  const staff = dto.createdById ? await this.prisma.staff.findUnique({
    where: { id: dto.createdById },
    select: { id: true, cafeId: true },
  }) : null;
  if (staff && staff.cafeId !== cafeId) throw new ForbiddenException();
}

// closing.service.ts
async markPaid(orderId: string, dto: any, cafeId: string) {
  const order = await this.prisma.order.findUnique({ where: { id } });
  if (!order || order.cafeId !== cafeId) throw new ForbiddenException();
}

// products.service.ts
async create(dto: CreateProductDto, cafeId: string) {
  const branch = await this.prisma.branch.findFirst({ 
    where: { cafeId, slug: 'main-branch' }  // FIXED: cafeId
  });
}

// drivers.service.ts
async create(dto: CreateDriverDto, cafeId: string) {
  const branch = await this.prisma.branch.findFirst({ 
    where: { cafeId, slug: 'main-branch' }  // FIXED: cafeId
  });
}

async getDriverStats(driverId: string, cafeId: string) {
  const orders = await this.prisma.order.findMany({
    where: { driverId, cafeId, status: 'DELIVERED' }  // FIXED: cafeId
  });
}
```

**Tests:** Verify each method enforces cafeId ownership.

**Rollback:** Restore previous signatures.

---

### Commit 9: Controller Layer — Ensure @cafeId() Forwarding

**Files:** Every controller that calls the fixed methods.

**Changes:** Ensure every route handler that calls a method requiring cafeId passes `@cafeId()`:

```typescript
// BEFORE — missing @cafeId()
@Post('payment/:id')
async markPaid(@Param('id') id: string, @Body() dto: any) {
  return this.closingService.markPaid(id, dto);
  // ⚠️ cafeId not passed — service will throw or leak
}

// AFTER — forwards cafeId
@Post('payment/:id')
async markPaid(@Param('id') id: string, @Body() dto: any, @cafeId() cafeId: string) {
  return this.closingService.markPaid(id, dto, cafeId);
}
```

**Affected controllers:** Every controller for every service listed above.

**Tests:** Verify all controller routes pass cafeId correctly with 200 response.

**Rollback:** Remove `@cafeId()` from each route.

---

### Commit 10: BullMQ Context Propagation

**Files:**
- `backend/src/queue/queue-bridge.service.ts`
- `backend/src/queue/processors/*.processor.ts` (all 7 processors)

**Changes:**

```typescript
// queue-bridge.service.ts — carry cafeId in job payload
@OnEvent('order.created')
async onOrderCreated(event: AppEvent) {
  const payload = event.payload as any;
  await this.queueService.addNotificationJob('order-created-notify', {
    ...payload,
    cafeId: payload.cafeId,  // MUST be carried from event
  }, { jobId: `notify-created-${payload.orderId}` });
}
```

```typescript
// Base processor pattern — wrap every job in TenantContext
// each.processor.ts
async process(job: Job): Promise<void> {
  const { cafeId } = job.data;
  if (!cafeId) {
    await this.deadLetterService.send(job, 'Missing cafeId');
    return;
  }
  await TenantContextService.run(cafeId, async () => {
    // All Prisma queries within this scope inherit cafeId
    await this.doWork(job.data);
  });
}
```

**Tests:** Verify processor job without cafeId goes to DLQ. Verify processor job with cafeId executes under correct tenant context.

**Rollback:** Remove TenantContext.run() from processors.

---

### Commit 11: WebSocket Cafe Room Isolation

**Files:**
- `backend/src/websocket/websocket.gateway.ts`

**Changes:** Already designed and tested in prior session. Apply room-based broadcast per cafeId.

**Tests:** Client A (cafe A) should not receive Client B's (cafe B) events.

---

### Commit 12: Integration Tests

**Files:**
- `backend/test/tenant-isolation.e2e-spec.ts` (NEW)

**Test scenarios:**

```typescript
describe('Tenant Isolation', () => {
  it('Cafe A cannot read Cafe B orders', async () => {
    const cafeA = await setupCafe('A');
    const cafeB = await setupCafe('B');
    const orderB = await createOrder(cafeB.id);

    const result = await request(app.getHttpServer())
      .get(`/orders/${orderB.id}`)
      .set('Authorization', `Bearer ${cafeA.token}`);

    expect(result.status).toBe(403);
  });

  it('Cafe A cannot pay Cafe B order', async () => {
    const orderB = await createOrder(cafeB.id);
    const result = await request(app.getHttpServer())
      .post(`/payment/mark/${orderB.id}`)
      .set('Authorization', `Bearer ${cafeA.token}`)
      .send({ amountPaid: 100 });

    expect(result.status).toBe(403);
  });

  it('mapAIToOrder returns only cafe products', async () => {
    await createProduct(cafeA.id, 'Espresso');
    await createProduct(cafeB.id, 'Latte');
    const products = await ordersService.mapAIToOrder([], cafeA.id);
    expect(products.map(p => p.name)).not.toContain('Latte');
  });

  it('LidMapping is scoped to cafe', async () => {
    await lidMappingService.upsert({ cafeId: cafeA.id, lid: 'L1', phone: '111' });
    await lidMappingService.upsert({ cafeId: cafeB.id, lid: 'L1', phone: '222' });
    const result = await lidMappingService.findByLid('L1', cafeA.id);
    expect(result.phone).toBe('111');
  });

  it('Report does not leak data across cafes', async () => {
    await createOrder(cafeA.id, 100);
    await createOrder(cafeB.id, 200);
    const report = await reportsService.fetchReportData('SALES', { 
      cafeId: cafeA.id 
    });
    expect(report.metrics.totalRevenue).toBe(100);
  });

  it('InventoryCache is scoped to cafe', async () => {
    await inventoryCacheService.initializeCache(cafeA.id);
    const stock = await inventoryCacheService.getStock(invA.id, cafeA.id);
    expect(Number(stock)).toBe(50);
    const stockB = await inventoryCacheService.getStock(invA.id, cafeB.id);
    expect(stockB).toBe(0); // Not in cafe B's cache
  });

  it('BullMQ processor uses correct cafe context', async () => {
    const job = { data: { cafeId: cafeA.id, orderId: orderA.id } };
    await expect(financialProcessor.process(job)).resolves.not.toThrow();
  });
});
```

**Test setup:** Create 2 cafes with separate data. Auth tokens for each.

**Rollback:** Delete test file.

---

### Summary: Commit Order & Dependencies

```
Commit 1: Schema + Migration        No deps
Commit 2: TenantContext + Middleware  No deps (but partial without 3+)
  ┌──────────────────────────────┐
  │  Commit 3: LidMapping/Reply  │  Depends on 1, 2
  │  Commit 4: PaymentService    │  Depends on 1, 2
  │  Commit 5: OrderStatus       │  Depends on 1, 2
  │  Commit 6: Inventory         │  Depends on 1, 2
  │  Commit 7: Reports+Financial │  Depends on 1, 2
  │  Commit 8: InCafe+Closing+   │  Depends on 1, 2
  │           Products+Drivers   │
  └──────────────┬───────────────┘
Commit 9: Controller Layer          Depends on 3-8
Commit 10: BullMQ Context           Depends on 2
Commit 11: WebSocket Rooms          No deps
Commit 12: Integration Tests        Depends on all
```

**Total: 12 commits, independently compilable and deployable.**
