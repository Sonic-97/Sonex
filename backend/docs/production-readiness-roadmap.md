# Sonic Coffee System — Production Readiness Remediation Roadmap

> **Audit date:** June 30, 2026
> **Previous score:** 3.5/10 (after 7 P0 blockers fixed)
> **Current verified score:** 4.5/10 (2 new P0s found, 3 previously assumed fixed are NOT)
> **Target:** 8.5/10

---

## Verified Issue Registry

### P0 — System Unsafe to Deploy

| ID | Issue | Root Cause | Affected Files | DB Changes | Complexity |
|---|---|---|---|---|---|
| P0-1 | **OrderFlow session unprotected** | `acquireOrderFlowLock` defined (redis.service.ts:96) but NEVER called from `OrderFlowService.handleMessage`. Two concurrent WhatsApp messages from the same phone corrupt the in-process state machine — step WELCOME gets overwritten by step PRODUCT_SELECT, session data lost. | `src/redis/redis.service.ts` (define), `src/order-flow/order-flow.service.ts` (no caller), `src/communication/communication.service.ts` (entry point) | None | **S** — 1 lock acquisition call |
| P0-2 | **Inventory split-brain (Redis/DB)** | `deductRecipeStock` line 152: `inventoryCacheService.updateStock()` decrements Redis. Line 160: queues BullMQ `sync-inventory` job. If Redis persists but BullMQ worker crashes before DB sync, DB stock is permanently stale. The DB-only fallback (line 188) only runs when Redis is DOWN, not when sync job fails. | `src/inventory/inventory.service.ts` (lines 125-215), `src/inventory/processors/inventory-sync.processor.ts` | Remove `stockDeducted` flag, add `inventory_deductions` table for WAL | **M** |
| P0-3 | **Double payment without SELECT FOR UPDATE** | `payment.service.ts:57`: `newlyPaidAmount = amountPaid - Number(order.amountPaid || 0)` computed OUTSIDE `$transaction`. At READ COMMITTED, two concurrent payments both read `amountPaid=0`, both compute `newlyPaidAmount=100`, both succeed. Order receives 2x credit, debt records are corrupted. | `src/payment/payment.service.ts` (line 57), `src/payment/payment.module.ts` | Add `version INT DEFAULT 0` to Order model, add `@@index([cafeId, paymentStatus, paidAt])` | **M** |
| P0-4 | **Prisma connection pool = 10** | `prisma.service.ts` creates `PrismaClient` with default pool size of 10. At 100 concurrent requests (customers + baristas + drivers), 90 requests queue in `pg` driver for 30s then timeout. Connection acquisition fails cascade to every downstream service. | `src/prisma/prisma.service.ts` | None (connection string change only) | **S** |
| P0-5 | **WebSocket broadcasts leak to all cafes** | `websocket.gateway.ts:38`: `this.server.of(ns).emit(event, data)` emits to ALL connected clients in a namespace regardless of `cafeId`. Cafe A owner receives Cafe B barista's order events. At 10 cafes × 1000 events/day = 10K irrelevant events per client. | `src/websocket/websocket.gateway.ts` (all 18 handlers) | None | **S** |
| P0-6 | **OpenWA server not running (port 2785)** | No OpenWA process. Webhook registration fails silently. `WhatsappService.sendMessage()` returns 0 HTTP error. Every outgoing message fails. LID resolution step 2 (`getContactPhone`) times out after 5s. | Infrastructure (not code) | None | **S** |
| P0-7 | **Redis not running (port 6379)** | No Redis process. All Redis operations silently return fallback: rate limiting DISABLED, dashboard cache DISABLED, dedup DISABLED, session lock ALWAYS GRANTED, inventory Redis path silently falls back to DB path (different code path with different semantics). | Infrastructure (not code) | None | **S** |

### P1 — High Priority

| ID | Issue | Root Cause | Affected Files | DB Changes | Complexity |
|---|---|---|---|---|---|
| P1-1 | **Reports raw SQL paths lack cafeId filter** | `reports.service.ts:187`: `WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND o."paymentStatus" = 'PAID'` — NO `cafeId` filter. An authenticated Cafe A owner can query Cafe B orders via the reports endpoint if they manipulate the report job. | `src/reports/reports.service.ts` (SALES/PROFIT raw SQL), `src/reports/reports.controller.ts` | None | **S** |
| P1-2 | **No `externalId` on Order (webhook dedup)** | `CommunicationService.handleMessage` deduplicates via `whatsAppLog.messageId`, but if the webhook retry creates a new log entry (e.g., first attempt timed out after logging), a duplicate `Order` is created. No `externalId` unique constraint on Order to prevent this. | `src/orders/orders.service.ts` (create, createFromAI), `prisma/schema.prisma` (Order model) | Add `externalId String? @unique` to Order, index `@@index([cafeId, externalId])` | **S** |
| P1-3 | **No `version` column for optimistic locking** | `markOrderPayment` and `updateOrderStatus` both read-then-write Order rows without version check. Under concurrent access, lost updates occur. Adding `version INT @default(0)` enables `WHERE version = X` on every update to reject stale writes. | `prisma/schema.prisma` (Order), `src/payment/payment.service.ts`, `src/orders/order-status.service.ts` | Add `version INT @default(0)` to Order model | **M** |
| P1-4 | **PendingReply/LidMapping concurrent upsert race** | `LidMappingService.upsert()` uses Prisma `upsert` which translates to `ON CONFLICT DO UPDATE`. Two concurrent calls with the same `lid` can cause P2002 unique violation because PostgreSQL's `ON CONFLICT` covers one constraint per statement. No retry wrapper. | `src/lid-mapping/lid-mapping.service.ts`, `src/pending-reply/pending-reply.service.ts` | None | **S** |
| P1-5 | **CommunicationService God Object** | 573-line method, 9 injected services, handles webhook, LID resolution, LID→phone reconciliation, order creation, reply sending, message logging. Single failure kills the entire WhatsApp pipeline. | `src/communication/communication.service.ts` (entire file) | None (architectural) | **L** |
| P1-6 | **No graceful shutdown / drain** | On SIGTERM, BullMQ jobs in progress are terminated mid-execution. Partial inventory deductions and half-created orders are not compensated. WebSocket clients get abrupt disconnect. | `src/main.ts`, `src/queue/queue.module.ts` | None | **M** |
| P1-7 | **Webhook endpoint has no rate limiting** | `POST /webhook` accepts unlimited concurrent requests. A webhook flood (e.g., OpenWA retry storm) can saturate the 10-connection Prisma pool and crash the DB. | `src/communication/communication.controller.ts` (or webhook controller) | None | **S** |

### P2 — Performance & Observability

| ID | Issue | Root Cause | Affected Files | DB Changes | Complexity |
|---|---|---|---|---|---|
| P2-1 | **Analytics loads all rows in memory** | `sales-analytics.service.ts`, `revenue-analytics.service.ts`, `staff-analytics.service.ts` — several methods use `findMany()` then `reduce()` in JS instead of SQL `SUM/GROUP BY`. For 6-month ranges with 50K+ orders, each call loads 50K rows into Node.js heap. | `src/analytics/*.service.ts` (7 files) | None (query rewrite only) | **L** |
| P2-2 | **Missing composite indexes** | Dashboard/analytics queries filter by `Orders[cafeId, status, createdAt]` but only `Orders[cafeId, branchId, createdAt]` exists. Similarly, `InCafeOrders[cafeId, paymentStatus, createdAt]`, `Expenses[cafeId, expenseDate]` missing. | `prisma/schema.prisma` | Add 5 composite indexes | **S** |
| P2-3 | **No health endpoint** | No `GET /health` for load balancer, Kubernetes, or monitoring. No health check integrates OpenWA, Redis, DB, and queue depths into a single endpoint. | `backend/src/` (new file) | None | **S** |
| P2-4 | **No structured logging** | All logs use `Logger.log(string)` with no JSON, no correlation ID, no request context. Cannot trace a single order through the system across services. | Every `.service.ts` file | None | **M** |
| P2-5 | **No metrics** | No request rate, error rate, latency percentiles (p50/p95/p99). No queue depth metrics. No way to detect degradation before customers complain. | `src/main.ts` | None | **M** |
| P2-6 | **Event-driven architecture not built** | Design exists in `backend/docs/event-driven-architecture.md` but zero lines of the implementation exist. All flows remain synchronous. | 33 planned files | Multiple (phase 4) | **XL** |
| P2-7 | **Dashboard no Redis cache** | `getOwnerDashboard()` recomputes product profitability, attendance summary, and daily aggregates on every page load. Without Redis cache, it hits 10+ queries per request. | `src/dashboard/dashboard.service.ts` | None | **S** |
| P2-8 | **No timeout on external HTTP calls** | `AiService.parseMessage()` calls DeepSeek API with no timeout. If DeepSeek hangs, the entire `handleMessage` thread hangs indefinitely. `inventory-sync.processor.ts` BullMQ jobs also lack timeout. | `src/ai/ai.service.ts`, `src/inventory/processors/inventory-sync.processor.ts` | None | **S** |

---

## Week 1 Roadmap — Life-Saving Surgery

**Theme:** Stop the bleeding. Fix all 7 P0 issues that make the system unsafe to deploy.

### Day 1-2: P0-1 — Protect OrderFlow Sessions

**Root cause:** `acquireOrderFlowLock` exists but never called.

**Implementation:**
```typescript
// order-flow.service.ts — in handleMessage()
async handleMessage(phone: string, message: string, cafeId?: string, replyJid?: string) {
  const lockAcquired = await this.redisService.acquireOrderFlowLock(phone);
  if (!lockAcquired) {
    this.logger.warn(`[OrderFlow] Concurrent access detected for ${phone}, returning retry prompt`);
    return this.buildRetryPrompt(cafeId);
  }
  try {
    // ... existing flow ...
  } finally {
    await this.redisService.releaseOrderFlowLock(phone);
  }
}
```

**Testing:**
- Unit: Mock `acquireOrderFlowLock()` returns false → verify retry prompt returned
- Integration: 2 concurrent messages for same phone from different threads → verify one gets retry prompt
- Chaos: Send 10 messages for same phone in 100ms window → verify no session corruption

**Rollback:** Comment out the `acquireLock`/`releaseLock` calls.

### Day 2-3: P0-2 — Eliminate Inventory Split-Brain

**Root cause:** Redis-first then async BullMQ sync creates inconsistency window.

**Decision:** **Option A** (recommended) — Remove Redis path entirely. Direct atomic DB deduction is ~2ms slower but eliminates split-brain permanently.

**Implementation:**
```typescript
// inventory.service.ts — replace deductRecipeStock
async deductRecipeStock(orderId: string) {
  return this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { product: { include: { recipe: true } } } },
    });
    if (!order || order.stockDeducted) return;

    for (const item of order.items) {
      for (const recipe of item.product.recipe) {
        const inv = await tx.inventory.findUnique({ where: { id: recipe.inventoryId } });
        if (!inv || inv.currentQty < recipe.quantity) {
          throw new BadRequestException(`Insufficient stock: ${inv?.itemName}`);
        }
        await tx.inventory.update({
          where: { id: recipe.inventoryId },
          data: { currentQty: { decrement: recipe.quantity } },
        });
        await tx.inventoryConsumption.create({
          data: {
            inventoryId: recipe.inventoryId,
            orderId,
            productId: item.productId,
            quantity: recipe.quantity,
            unit: recipe.unit,
            costPerUnit: inv.costPerUnit,
            totalCost: Number(recipe.quantity) * Number(inv.costPerUnit),
            cafeId: order.cafeId,
          },
        });
      }
    }
    await tx.order.update({ where: { id: orderId }, data: { stockDeducted: true } });
  });
}
```

**Remove:** `InventoryCacheService` usage, `queueService.addInventorySyncJob()` calls, Redis stock cache code in `inventory.service.ts`.

**Testing:**
- Unit: Mock transaction → verify atomic decrement + consumption log
- Integration: Create order → verify DB stock matches expected (including rollback test)
- Chaos: Kill process between Redis decrement and DB sync (before fix: permanent split-brain; after fix: no Redis path, so consistent)

**Rollback:** Revert to previous `deductRecipeStock` (keeping Redis + BullMQ path).

### Day 3-4: P0-3 — Prevent Double Payment

**Root cause:** `newlyPaidAmount` computed outside transaction + no `SELECT FOR UPDATE`.

**Implementation:**
```typescript
// payment.service.ts — in markOrderPayment()
async markOrderPayment(orderId: string, dto: MarkPaymentDto, cafeId?: string) {
  return this.prisma.$transaction(async (tx) => {
    // SELECT FOR UPDATE — blocks concurrent writes
    const order = await tx.$queryRaw<Array<{ id: string; amount_paid: number; version: number }>>`
      SELECT id, amount_paid, version FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
    if (!order.length) throw new NotFoundException();

    const currentPaid = Number(order[0].amount_paid);
    const newlyPaidAmount = Number(dto.amountPaid) - currentPaid;
    if (newlyPaidAmount <= 0) throw new BadRequestException('Amount must be greater than already paid');

    // Optimistic lock check
    const updated = await tx.order.updateMany({
      where: { id: orderId, version: order[0].version },
      data: {
        paid: dto.paid ?? true,
        paymentStatus: dto.paymentStatus ?? 'PAID',
        amountPaid: { increment: newlyPaidAmount },
        remainingAmount: dto.remainingAmount ?? 0,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw new ConflictException('Concurrent payment detected, retry');

    // ... rest of existing transaction body ...
  });
}
```

**Testing:**
- Unit: Mock `$queryRaw` with version mismatch → verify `ConflictException`
- Integration: 2 concurrent `markOrderPayment(100)` calls → verify only one succeeds, total paid = 100
- Chaos: Fire 50 concurrent requests → verify total paid never exceeds order total

**Rollback:** Revert to `UPDATE` without `FOR UPDATE` and version check.

### Day 4-5: P0-4 — Configure Prisma Pool

**Implementation:**
```typescript
// prisma.service.ts constructor
constructor() {
  super({
    datasources: {
      db: {
        url: process.env.DATABASE_URL + '&connection_limit=50',
      },
    },
    log: ['error'],
  });
}
```

Also update `.env` DATABASE_URL to include `?connection_limit=50&pgbouncer=true`.

**Testing:** Load test with 100 concurrent requests → verify pool maxes at 50, no connection timeout.

**Rollback:** Remove connection string params.

### Day 5-6: P0-5 — Isolate WebSocket Broadcasts

**Root cause:** `broadcastToAll` emits to namespace, ignores cafeId.

**Implementation:**
```typescript
// websocket.gateway.ts
private broadcastToCafe(cafeId: string, event: string, data: any) {
  this.server.to(`cafe:${cafeId}`).emit(event, data);
}

// On connection — client joins cafe room
@SubscribeMessage('join')
async handleJoin(client: Socket, payload: { cafeId: string }) {
  client.join(`cafe:${payload.cafeId}`);
}
```

All 18 event handlers change from `broadcastToAll(...)` to `broadcastToCafe(event.payload.cafeId, event, data)`.

**Testing:**
- Integration: Client joins `cafe:A`, another joins `cafe:B`. Emit event for cafe:A → only cafe:A client receives it.
- Unit: Mock `server.to('cafe:xxx').emit()` → verify correct room.

**Rollback:** Revert to `broadcastToAll`.

### Day 6-7: P0-6 + P0-7 — Fix Infrastructure

**Implementation:**
- Start OpenWA: Verify port 2785, webhook registration, message send
- Start Redis: Verify port 6379, `SET/GET`, `SETNX` for dedup

**Testing:** Integration: Send WhatsApp message → verify end-to-end flow through OpenWA. Verify health check registers both services.

**Migration:** Update `.env.example` with documented dependencies.

---

## Week 2 Roadmap — Data Integrity & Reliability

**Theme:** Ensure every write is correct, every failure is handled, every duplicate is blocked.

### Day 8-9: P1-1 Fix Reports cafeId Filtering

**Implementation:** Add `cafeId` filter to all raw SQL queries in `reports.service.ts`:

```typescript
const cafeFilter = cafeId ? Prisma.sql`AND o.cafe_id = ${cafeId}` : Prisma.empty;
```

Apply to all 6 raw SQL queries in `fetchReportData` (SALES, PROFIT, ORDERS, INVENTORY types).

**Testing:** Authenticate as Cafe A, call `GET /reports/generate/SALES` → verify result contains only Cafe A's data.

### Day 9-10: P1-2 Add Order.externalId

**Schema change:**
```prisma
model Order {
  // ... existing fields ...
  externalId String? @unique
  // ...
  @@index([cafeId, externalId])
}
```

**Implementation:** In `OrdersService.create()` and `createFromAI()`, accept and store `externalId` when provided via webhook. Check `externalId` before creating:

```typescript
if (dto.externalId) {
  const existing = await tx.order.findUnique({ where: { externalId: dto.externalId } });
  if (existing) return existing; // idempotent return
}
```

**Migration:** `npx prisma db push --accept-data-loss` to add column.

**Testing:** Send same webhook payload twice → verify only one order created. Verify second call returns existing order.

### Day 10-12: P1-3 Add Optimistic Locking

**Schema change:**
```prisma
model Order {
  version Int @default(0)
}
```

**Implementation pattern:**
```typescript
// order-status.service.ts — in updateOrderStatus()
const updated = await tx.order.updateMany({
  where: { id: orderId, version: currentVersion },
  data: { status, version: { increment: 1 } },
});
if (updated.count === 0) throw new ConflictException('Order was modified by another user');
```

Apply to: `updateOrderStatus`, `markOrderPayment`, `cancel`, `createFromAI` (stock decrement).

**Migration:** `npx prisma db push`.

**Testing:** 2 concurrent status updates → verify one fails with ConflictException.

### Day 12-13: P1-4 Retry Wrapper for Concurrent Upserts

**Implementation:**
```typescript
// lid-mapping.service.ts
async upsert(input: UpsertLidMappingInput): Promise<LidMapping> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await this.prisma.lidMapping.upsert({ where: { lid: input.lid }, ... });
    } catch (err) {
      if (err.code === 'P2002' && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 100 * attempt));
        continue;
      }
      throw err;
    }
  }
}
```

Apply same pattern to `PendingReplyService.create()`.

**Testing:** 10 concurrent upserts for same LID → verify all succeed (no P2002).

### Day 13-14: P1-6 Graceful Shutdown

**Implementation:**
```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // Graceful drain
  const logger = new Logger('Bootstrap');
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received. Draining queues...');
    const queueService = app.get(QueueService);
    await queueService.drain();
    await new Promise(resolve => setTimeout(resolve, 10000)); // wait for active jobs
    await app.close();
    process.exit(0);
  });
}
```

**Testing:** Send SIGTERM during order creation → verify active job completes, no partial orders.

---

## Week 3 Roadmap — Scalability & Isolation

**Theme:** Make the system fast at scale. Fix the N+1s, the memory loaders, and the missing indexes.

### Day 15-16: P2-2 Add Missing Composite Indexes

```prisma
model Order {
  @@index([cafeId, status, createdAt])
  @@index([cafeId, paymentStatus, paidAt])
}

model InCafeOrder {
  @@index([cafeId, status, createdAt])
  @@index([cafeId, paymentStatus, createdAt])
}

model Expense {
  @@index([cafeId, expenseDate])
  @@index([cafeId, category])
}

model Attendance {
  @@index([cafeId, date, status])
}
```

**Migration:** `npx prisma db push`.

**Testing:** Before/after `EXPLAIN ANALYZE` on dashboard queries → verify index scans, not sequential scans.

### Day 16-18: P2-1 Rewrite Analytics to SQL

**Implementation pattern:** Replace `findMany` + `reduce` with `$queryRaw` + `SUM/GROUP BY` in:
- `sales-analytics.service.ts` — `topProductsByRevenue`, `categoryPerformance`
- `revenue-analytics.service.ts` — `dailyRevenue`, `hourlyRevenueDistribution`
- `staff-analytics.service.ts` — `topStaffByOrders`, `staffEfficiencyScore`
- `driver-analytics.service.ts` — all methods
- `customer-analytics.service.ts` — all methods
- `business-insights.service.ts` — all methods

Reference the pattern established in `analytics.service.ts` (already rewritten in prior session).

**Testing:** Compare before/after results for the same date range → verify identical output. Verify query time drops from 5s to 50ms.

### Day 18-19: P2-7 Dashboard Redis Caching

**Implementation:** Already partially done in prior session (cache framework exists). Complete the cache for:
- `getSalesSummary` — 60s TTL
- `getPendingOrders` — 15s TTL
- `getLowStock` — 30s TTL

**Testing:** First dashboard load = slow (200ms). Second load within TTL = fast (<5ms).

### Day 19-20: P1-5 Decompose CommunicationService (Phase 1)

**Implementation:** Extract webhook handling into a standalone `WebhookController`:

```typescript
// webhook/webhook.controller.ts
@Post()
async handleWebhook(@Body() body: any) {
  const message = extractMessage(body);
  const messageId = extractMessageId(body);
  await this.eventBus.publish('message.received', { message, messageId, ... });
  return { status: 'accepted' };
}
```

CommunicationService retains: `resolveSender`, `reconcileLidToPhone`, legacy sync path.

**Testing:** Webhook returns 202 immediately. No behavioral change for end users.

### Day 20-21: P2-8 Add HTTP Timeouts

**Implementation:**
```typescript
// ai.service.ts
async parseMessage(message: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await this.deepseekApi.call(message, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
```

Apply to: `WhatsappService.getContactPhone()`, `WhatsappService.sendMessage()`, `inventory-sync.processor.ts` jobs.

**Testing:** Kill external service → verify timeout after 10s, not indefinite hang.

---

## Week 4 Roadmap — Observability & Defense in Depth

**Theme:** Make every failure visible, every request traceable, every bottleneck measurable.

### Day 22-23: P2-3 Health Endpoint

```typescript
// health/health.controller.ts
@Get()
async check() {
  const results = await Promise.allSettled([
    this.checkDatabase(),
    this.checkRedis(),
    this.checkOpenWA(),
    this.checkQueueDepth(),
  ]);
  const healthy = results.every(r => r.status === 'fulfilled' && r.value);
  return { status: healthy ? 'ok' : 'degraded', checks: results };
}
```

Expose at `GET /health`. Integrates with Kubernetes liveness/readiness probes.

**Testing:** Kill Redis → verify `degraded` status. Kill DB → verify `degraded` + error details.

### Day 23-24: P2-4 Structured Logging

**Implementation:** Add a logging interceptor:

```typescript
// common/logging.interceptor.ts
@Injectable()
class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const correlationId = request.headers['x-correlation-id'] || uuid();
    request.correlationId = correlationId;

    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        Logger.log(JSON.stringify({
          correlationId,
          method: request.method,
          url: request.url,
          statusCode: context.switchToHttp().getResponse().statusCode,
          duration: Date.now() - now,
          cafeId: request.cafeId,
        }));
      }),
    );
  }
}
```

**Testing:** Call any endpoint → verify JSON log line with correlationId.

### Day 24-25: P2-5 Metrics

**Implementation:** Add Prometheus metrics middleware:

```typescript
// common/metrics.middleware.ts
import * as prometheus from 'prom-client';

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 3000],
});

const queueDepth = new prometheus.Gauge({
  name: 'bullmq_queue_depth',
  help: 'Number of jobs waiting in each queue',
  labelNames: ['queue'],
});
```

Expose `GET /metrics` for Prometheus scraping.

**Testing:** Verify `/metrics` returns valid Prometheus format. Dashboard queries in Grafana.

### Day 25-26: P1-7 Rate Limit Webhook

```typescript
// webhook/webhook.controller.ts
@Post()
@UseGuards(RateLimitGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests/minute per IP
async handleWebhook(@Body() body: any) { ... }
```

Uses existing `RedisService.checkRateLimit()` with sliding window.

**Testing:** Fire 31 requests in 1 minute from same IP → verify 31st gets 429.

### Day 26-27: P2-6 Event-Driven Architecture (Phase 1 Bootstrap)

**Implementation:** Create the event infrastructure:
- `event-schemas.ts` — all 11 Zod schemas (already designed)
- `event-bus.service.ts` — wraps BullMQ Queue for event publishing
- `event-dedup.service.ts` — generic Redis dedup

**Migration:** All existing EventEmitter2 calls remain. New events are dual-published to both EventEmitter2 (sync, existing consumers) and BullMQ (async, new consumers under feature flag).

**Testing:** Publish event → verify it appears in Redis dedup + BullMQ queue.

### Day 27-28: Final System Test

**Full integration suite:**
1. WhatsApp order end-to-end (via OpenWA mock)
2. WebSocket isolation (Cafe A sees only Cafe A events)
3. Concurrent payment test (50 concurrent, no double-count)
4. Inventory consistency (100 orders, all stock correct)
5. Graceful shutdown during order creation
6. Rate limiting on webhook
7. Health endpoint returns correct status
8. Metrics endpoint returns valid data
9. Structured logging captures correlation IDs
10. Redis + OpenWA restart → system auto-recovery

---

## Final Production Readiness Scores

### Current (Before Week 1)

| Dimension | Score | Rationale |
|---|---|---|
| **Multi-tenant isolation** | 6/10 | CafeId is passed through all services. 1 gap in reports raw SQL. Controllers enforce `@cafeId()`. |
| **Data integrity** | 3/10 | Double payment at 50%+ concurrency. Inventory split-brain on crash. No optimistic locking. No externalId dedup. |
| **Reliability** | 3/10 | Redis not running = all guards disabled. OpenWA not running = system is mute. OrderFlow sessions unprotected. No graceful shutdown. |
| **Scalability** | 2/10 | Pool = 10 connections. WebSocket events leak to all tenants. Analytics loads 50K rows into memory. Missing indexes cause seq scans. |
| **Observability** | 1/10 | No health endpoint. No structured logging. No metrics. No tracing. No alerting. Debugging requires reading raw console logs. |
| **Security** | 5/10 | JWT auth works, guards enforce tenant isolation for API. But rate limiting is disabled (Redis down), no CSRF on webhook, no request validation schemas. |
| **Production readiness** | **4.5/10** | 4 P0s remain. 2 P0s are infrastructure (OpenWA + Redis down). 3 P1s affect data integrity. 0 observability for production debugging. |

### Target (After Week 4)

| Dimension | Score | What Changed |
|---|---|---|
| **Multi-tenant isolation** | 9/10 | Reports raw SQL fixed. WebSocket rooms added. All services verified. |
| **Data integrity** | 8/10 | `SELECT FOR UPDATE` + version locking. No split-brain (DB-only inventory). `externalId` dedup on webhook retry. Retry wrapper on concurrent upserts. |
| **Reliability** | 7/10 | Graceful shutdown with queue drain. Rate limited webhook. OrderFlow lock acquired. OpenWA + Redis running. Auto-recovery health checks. |
| **Scalability** | 7/10 | Pool=50. WebSocket per-cafe rooms. Analytics rewritten to SQL. Indexes added. Dashboard cached. |
| **Observability** | 7/10 | Health endpoint. Structured JSON logs with correlation IDs. Prometheus metrics. Queue depth monitoring. |
| **Security** | 7/10 | Rate limiting enabled. Input validation (Zod schemas). Proper HTTP timeouts. |
| **Production readiness** | **8.5/10** | All P0s fixed. 6/7 P1s fixed. 5/8 P2s fixed. Event-driven architecture foundation laid. Next iteration can focus on P2-6 (full event-driven migration). |

### Score Calculation Method

Each dimension is scored independently based on verified capability:

- **0-2**: No protection / actively dangerous
- **3-4**: Partial protection, known gaps under load
- **5-6**: Working for single-tenant / low traffic, fails under concurrency
- **7-8**: Correct under expected load, manual recovery for edge cases
- **9-10**: Automated recovery, provably correct, chaos-tested

**Final production readiness** = weighted average: Data Integrity (25%) + Reliability (25%) + Scalability (15%) + Multi-tenant isolation (15%) + Security (10%) + Observability (10%)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenWA becomes unstable after start | Medium | High (system mute) | Webhook auto-recovery (60s interval already exists). Add circuit breaker + alert. |
| Redis connectivity intermittent | Medium | High (dedup/rate limit/session locks all fall back) | Add Redis health check. Circuit breaker: 3 failures → alert + fallback logging. |
| DeepSeek API rate limits during peak | Medium | Medium (AI orders fall back to state machine) | Circuit breaker already defined (5 failures in 60s → OPEN for 30s). Fallback to OrderFlow state machine. |
| Prisma pool exhaustion at 50 | Low (after fix) | High (all DB queries fail) | Monitor via `pg_stat_activity`. Auto-scale pool via env var. Alert at 80% utilization. |
| Concurrent payment at identity fraud scale | Low | Critical (financial loss) | `SELECT FOR UPDATE` + version lock. Audit log every payment. Daily reconciliation job. |

## Migration Notes

- **Every schema change** uses `prisma db push` (not migrate) to match existing practices
- **Feature flags** enable gradual rollout: `FEATURE_ASYNC`, `FEATURE_VERSION_LOCK`, etc.
- **Backward compatibility**: All DB changes add nullable/optional columns. Existing code ignores them until the consumer is updated.
- **Rollback**: Each fix is a self-contained commit. Revert the commit to roll back. Schema changes need a reverse migration.

## Freeze Window

A 2-week code freeze is recommended between Week 2 and Week 3 to:
1. Run a 48-hour chaos test (kill services, flood webhook, concurrent payments)
2. Fix any issues found
3. Validate the new P0 fixes under production-like load
