# Sonic Coffee System — Event-Driven Architecture

## 1. Current Architecture Problems

### God Object
`CommunicationService` injects 9 services, owns the entire WhatsApp message lifecycle in one 573-line method (`handleMessage`). Any change to any part of the flow risks breaking the whole.

### Synchronous Chain
```
Webhook → resolveSender → LidMapping.upsert → retryPendingReplies → 
  WhatsAppLog.create → MessagesService.logMessage → Customer lookup → 
  AI parse → OrderService.createFromAI (transaction with 7 writes) → 
  OrderFlowService.handleMessage → LID resolve → PendingReply → 
  WhatsappService.sendMessage → MessagesService.logMessage → WhatsAppLog.create
```
Failure at step 17 leaves the system in an inconsistent state. No compensation.

### Unreliable Fire-and-Forget
`retryPendingRepliesForLid` and `checkLowStock` are called without error handling or retry. If the DB is under load, these calls silently fail.

### Transaction Boundary Bleed
`reconcileLidToPhone` wraps 8+ writes (including HTTP call to `retryPendingRepliesForLid`) inside a single `$transaction`. The HTTP call can timeout, holding the connection open.

### Partial Async Coverage
Only 7 events route through BullMQ. Events like `inventory-deducted`, `payment-collected`, `lid-mapped` are purely in-process EventEmitter2 — no persistence, no retry, no ordering.

---

## 2. Event Contracts

### 2.1 Base Envelope

Every event has a canonical envelope:

```typescript
interface EventEnvelope<T = Record<string, unknown>> {
  eventId: string;       // UUID v4 — global dedup key
  eventType: string;     // e.g. "order.created"
  eventVersion: number;  // schema version (starts at 1)
  timestamp: string;     // ISO 8601 (producer clock)
  source: string;        // service name, e.g. "communication-service"
  cafeId: string;        // tenant scope
  correlationId: string; // traces across event chain (same as first eventId)
  causationId: string;   // immediate parent eventId
  payload: T;
}
```

### 2.2 Event Schemas

#### `message.received`
Emitted when a raw WhatsApp webhook payload arrives.

```typescript
interface MessageReceivedPayload {
  messageId: string;         // WhatsApp message ID (dedup)
  remoteJid: string;         // sender JID (@lid or @c.us or @s.whatsapp.net)
  message: string;           // text content
  participant?: string;      // group chat author
  fromMe: boolean;
  timestamp: number;         // WhatsApp server timestamp
}
```
- **Producer**: `WebhookController` (after basic validation)
- **Consumers**: `SenderResolver`, `Deduplication`
- **Retry**: 3 attempts, exponential 2s-4s-8s
- **Idempotency**: `messageId` via Redis `SETNX` with 86400s TTL

#### `sender.resolved`
Emitted when a sender JID is resolved to a phone number.

```typescript
interface SenderResolvedPayload {
  remoteJid: string;      // original @lid or @c.us
  phone: string;          // resolved phone number
  phoneJid: string;       // phone@s.whatsapp.net or phone@c.us
  resolutionPath: string; // 'lid_mapping' | 'contacts_store' | 'session_cache' | 'customer_record' | 'direct'
  cafeId: string;
}
```
- **Producer**: `SenderResolver` (after waterfall resolution)
- **Consumers**: `LidMappingPersister`, `PendingReplyResolver`, `CustomerPhoneUpdater`, `OrderFlowSessionMigrator`
- **Retry**: 3 attempts, exponential 2s-4s-8s
- **Idempotency**: `remoteJid + cafeId` via Redis 3600s TTL

#### `message.parsed`
Emitted after a message is parsed by AI or order flow state machine.

```typescript
interface MessageParsedPayload {
  phone: string;               // resolved sender phone
  message: string;             // original text
  intent: 'create_order' | 'order_flow' | 'unknown' | 'inquiry';
  confidence: number;          // AI confidence (0-1), 1 for order flow
  entities?: {
    items?: Array<{ name: string; quantity: number }>;
    customerName?: string;
    notes?: string;
    isRepeatOrder?: boolean;
  };
  cafeId: string;
}
```
- **Producer**: `MessageParser` (choose between AI parser and OrderFlow state machine)
- **Consumers**: `OrderCreator`, `OrderFlowResponseBuilder`
- **Retry**: 2 attempts, exponential 2s-4s (AI parsing is expensive, fail fast)
- **Idempotency**: Not needed (message.received dedup already covers it)

#### `customer.resolved`
Emitted when a customer record is confirmed/created for an order.

```typescript
interface CustomerResolvedPayload {
  customerId: string;
  phone: string;
  name?: string;
  cafeId: string;
  branchId: string;
  isNew: boolean;          // true if newly created
  totalOrders: number;     // after increment
  totalSpent: number;      // after increment
}
```
- **Producer**: `CustomerResolveConsumer` (consumer of `message.parsed`)
- **Consumers**: `OrderCreator`
- **Retry**: 5 attempts, exponential 2s-4s-8s-16s-32s (DB contention on upsert)
- **Idempotency**: `phone + cafeId + branchId` via unique constraint

#### `order.created`
Emitted when an order is persisted to the database.

```typescript
interface OrderCreatedPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  customerId: string;
  customerPhone: string;
  status: string;            // 'NEW'
  total: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    options?: Record<string, string>;
  }>;
  sourceType: string;        // 'WHATSAPP_ORDER' | 'INSIDE_CAFE' | 'OUTSIDE_CAFE'
  source: string;            // 'WHATSAPP' | 'POS' | 'AI'
  createdAt: string;         // ISO 8601
  createdById?: string;      // staff who created it
  employeeId?: string;       // "brought by" staff
}
```
- **Producer**: `OrderCreator` (after transaction commit)
- **Consumers**: `InventoryDeducter`, `WhatsAppNotifier`, `AnalyticsUpdater`, `KitchenDisplay`, `WebSocketBroadcaster`
- **Retry**: 3 attempts, exponential 2s-4s-8s
- **Idempotency**: `orderId` via unique constraint in DB (PostgreSQL PK)

#### `order.confirmed`
Emitted when a barista moves an order to CONFIRMED status.

```typescript
interface OrderConfirmedPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  status: string;            // 'CONFIRMED'
  staffId: string;           // barista who confirmed
  confirmedAt: string;       // ISO 8601
}
```
- **Producer**: `OrderStatusService` (after status transition)
- **Consumers**: `InventoryDeducter`, `WhatsAppNotifier`, `KitchenDisplay`
- **Retry**: 3 attempts, exponential
- **Idempotency**: `orderId + status` via version check

#### `inventory.deducted`
Emitted after inventory is decremented for an order's items.

```typescript
interface InventoryDeductedPayload {
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
  stockDeductedAt: string;   // ISO 8601
}
```
- **Producer**: `InventoryDeducter`
- **Consumers**: `LowStockChecker`, `AnalyticsUpdater`, `ExpenseTracker`
- **Retry**: 5 attempts, exponential 2s-4s-8s-16s-32s (high contention on inventory rows)
- **Idempotency**: `orderId` via `order.stockDeducted` flag (DB check)

#### `payment.collected`
Emitted when a payment is received.

```typescript
interface PaymentCollectedPayload {
  paymentId?: string;
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  amount: number;
  method: string;            // 'CASH' | 'CARD' | 'WALLET'
  paymentStatus: string;     // 'PAID' | 'PARTIAL_PAYMENT'
  remainingAmount: number;
  collectedById: string;
  collectedByRole: string;   // 'BARISTA' | 'DRIVER' | 'OWNER'
  collectedAt: string;       // ISO 8601
  isDelivery: boolean;
}
```
- **Producer**: `PaymentService.markOrderPayment()` / `confirmDriverDelivery()`
- **Consumers**: `DebtTracker`, `DriverSettlement`, `FinancialRecorder`, `AnalyticsUpdater`, `WebSocketBroadcaster`
- **Retry**: 5 attempts, exponential 2s-4s-8s-16s-32s (financial criticality)
- **Idempotency**: `orderId + paymentStatus` via DB CHECK + Redis lock (15s TTL)

#### `pending-reply.created`
Emitted when a reply cannot be sent because the recipient JID is unresolved.

```typescript
interface PendingReplyCreatedPayload {
  pendingReplyId: string;
  lid: string;
  message: string;
  cafeId: string;
  createdAt: string;
}
```
- **Producer**: `LidResolver` (when all 5 steps exhausted)
- **Consumers**: `PendingReplyPersister`
- **Retry**: 2 attempts (persistence is fast)
- **Idempotency**: `lid + message content hash` via unique constraint

#### `pending-reply.resolved`
Emitted when a previously pending reply is successfully delivered.

```typescript
interface PendingReplyResolvedPayload {
  pendingReplyId: string;
  lid: string;
  phoneJid: string;
  resolvedAt: string;
}
```
- **Producer**: `PendingReplyResolver` (consumer of `sender.resolved`)
- **Consumers**: `PendingReplyCleaner`
- **Retry**: 3 attempts
- **Idempotency**: `pendingReplyId` via DB unique constraint

#### `webhook.registered`
Emitted when the WhatsApp webhook is registered or re-registered.

```typescript
interface WebhookRegisteredPayload {
  sessionId: string;
  webhookUrl: string;
  success: boolean;
  registeredAt: string;
  cafeId?: string;
}
```
- **Producer**: `WhatsappService.registerWebhook()`
- **Consumers**: `HealthChecker`
- **Retry**: No retry (health check handles re-registration)
- **Idempotency**: Not needed

#### `session.recovered`
Emitted when an order flow session is migrated from a temporary LID-based phone to a real phone after LID resolution.

```typescript
interface SessionRecoveredPayload {
  tempPhone: string;     // e.g. "lid_abc123"
  realPhone: string;     // e.g. "201234567890"
  cafeId: string;
  hadSession: boolean;
  hadPendingReply: boolean;
}
```
- **Producer**: `OrderFlowSessionMigrator` (consumer of `sender.resolved`)
- **Consumers**: `NotificationSender` (alert owner about recovered session)
- **Retry**: 3 attempts
- **Idempotency**: `tempPhone + realPhone` via Redis 3600s TTL

---

## 3. Producer/Consumer Map

```
┌──────────────────────────────────────────────────────────────────┐
│                         EVENT BUS                                 │
│  (BullMQ: order-processing + whatsapp + notification + inventory) │
└──────────────────────────────────────────────────────────────────┘

message.received
  ├── SenderResolver → emits sender.resolved
  └── Deduplication → drops if duplicate

sender.resolved
  ├── LidMappingPersister → LidMapping.upsert()
  ├── PendingReplyResolver → retry pending replies for this LID
  ├── CustomerPhoneUpdater → Customer.update(phoneJid)
  └── OrderFlowSessionMigrator → migrate session tempPhone→realPhone

message.parsed
  ├── OrderCreator → $transaction(customer + order + customerUpdate)
  │   └── emits order.created
  └── OrderFlowResponseBuilder → build next prompt
      └── emits whatsapp.send (via BullMQ whatsapp queue)

order.created
  ├── InventoryDeducter → recipe ingredients + stock decrement
  │   └── emits inventory.deducted
  ├── WhatsAppNotifier → "order received" confirmation to customer
  ├── AnalyticsUpdater → increment daily counts
  ├── KitchenDisplay → WebSocket broadcast to barista screen
  └── WebSocketBroadcaster → real-time UI update

order.confirmed
  ├── InventoryDeducter → (if not done at created)
  ├── WhatsAppNotifier → "order confirmed" to customer
  └── KitchenDisplay → update prep status

inventory.deducted
  ├── LowStockChecker → check thresholds → emit notification if low
  └── CostTracker → record ingredient cost for order

payment.collected
  ├── DebtTracker → settle debts / create debt record
  ├── DriverSettlement → update driver earnings
  ├── FinancialRecorder → create financialTransaction
  ├── CustomerUpdater → update customer unpaidBalance
  └── WebSocketBroadcaster → real-time UI update

pending-reply.created
  └── PendingReplyPersister → Prisma.create()

pending-reply.resolved
  └── PendingReplyCleaner → mark as resolved (no-op if already)

webhook.registered
  └── HealthChecker → update health status

session.recovered
  └── NotificationSender → notify owner
```

---

## 4. Retry Policies

| Queue | Backend Queue | Default Attempts | Backoff | Max Age on Fail | Rationale |
|---|---|---|---|---|---|
| **order-processing** | `order-processing` | 3 | exponential, 2s | 7 days | Order creation is moderate risk |
| **whatsapp** | `whatsapp` | 3 | exponential, 2s | 7 days | External API (OpenWA) may be down |
| **inventory** | `inventory` | 5 | exponential, 2s | 14 days | High contention on stock rows; split-brain risk |
| **inventory-sync** | `inventory-sync` | 5 | exponential, 2s | 14 days | Critical for Redis→DB consistency |
| **notification** | `notification` | 3 | exponential, 2s | 1 day | Non-critical; stale notifications are noise |
| **financial** | `financial-processing` | 5 | exponential, 2s | 30 days | Financial data must not be lost |
| **analytics** | `analytics-processing` | 2 | fixed, 10s | 1 day | Stale analytics auto-refresh next cycle |

### Backoff Formulas

- **Exponential**: `delay * 2^(attempt - 1)` where `delay = 2000ms`
  - Attempt 1 → 2s, Attempt 2 → 4s, Attempt 3 → 8s, Attempt 4 → 16s, Attempt 5 → 32s
- **Fixed**: `delay = 10000ms` regardless of attempt

---

## 5. Idempotency Guarantees

### Strategy: Event-Sourced Dedup with Optimistic Locking

Each consumer has an idempotency key derived from the event it processes. The key is stored in Redis with TTL, and the DB operation includes an optimistic lock or a unique constraint.

| Consumer | Idempotency Key | Storage | TTL | DB Guard |
|---|---|---|---|---|
| **Deduplication** (message.received) | `messageId` | Redis `SETNX` | 86400s (24h) | `whatsapp_logs.messageId` UNIQUE |
| **LidMappingPersister** | `lid` | PostgreSQL UNIQUE | — | `lid_mapping.lid` UNIQUE |
| **PendingReplyResolver** | `pendingReplyId` | PostgreSQL PK | — | `pending_reply.id` PK |
| **OrderCreator** (per phone) | `causationId` (event that triggered creation) | Redis `SETNX` | 3600s (1h) | Duplicate detection in transaction |
| **InventoryDeducter** | `orderId` | PostgreSQL `stockDeducted` flag | — | `WHERE stockDeducted = false` |
| **PaymentMarked** | `orderId + paymentStatus` | Redis `acquireLock` | 15s (lock) + DB CHECK | `version` column optimistic lock |
| **CustomerPhoneUpdater** | `phone + cafeId` | PostgreSQL UNIQUE | — | `customer.cafeId_branchId_phone` UNIQUE |

### Dedup Flow

```typescript
async function deduplicatedProcess(key: string, ttl: number, processFn: () => Promise<void>) {
  const dedupKey = `dedup:${key}`;

  // 1. Check Redis
  const alreadyProcessed = await redis.client.get(dedupKey);
  if (alreadyProcessed) return { skipped: true };

  // 2. Set tentative dedup (expires to prevent permanent stuck)
  await redis.client.setex(dedupKey, ttl, 'processing');

  // 3. Process (with DB-level idempotency)
  try {
    await processFn();
    // 4. Mark completed
    await redis.client.setex(dedupKey, ttl, 'completed');
    return { skipped: false };
  } catch (err) {
    // 5. Remove dedup on failure so retry can re-process
    await redis.client.del(dedupKey);
    throw err;
  }
}
```

---

## 6. Dead Letter Queue Strategy

### Architecture

Each queue has a corresponding DLQ (config already exists in `queue.config.ts`). When a job exhausts its retry attempts:

1. **Job moves to DLQ** automatically (BullMQ built-in)
2. **DLQ Monitor** (`DeadLetterService`) runs every 15 minutes:
   - Lists DLQ jobs grouped by failure reason
   - For known transient failures (e.g. "connection timeout", "rate limit"): re-queues with `priority: 10` and resets attempts to 3
   - For permanent failures (e.g. "invalid payload", "unknown product"): moves to manual review via Prisma `DeadLetter` table
3. **Manual replay endpoint**: `POST /admin/dlq/replay/:queueName/:jobId`
4. **Auto-purge**: DLQ entries > 30 days are archived

### DLQ Severity Classification

| Failure Type | Example | Action | Alert |
|---|---|---|---|
| **Transient** | Connection timeout, 503, rate limit | Auto-retry after 60s | Warning log |
| **Data-inconsistency** | Product not found, customer not found | DLQ → manual review | Critical Slack/Push |
| **Validation** | Invalid payload, missing required field | DLQ → discard | Error log |
| **Business-logic** | Double payment, negative stock after deduction | DLQ → immediate manual | P0 Phone call |

### DeadLetter Table (extend existing model)

```prisma
model DeadLetter {
  id        String   @id @default(dbgenerated("(gen_random_uuid())::text"))
  cafeId    String   @map("cafe_id")
  eventType String
  payload   String   // JSON stringified original event
  error     String   // last error message
  attempts  Int      @default(0)
  status    String   @default("pending") // pending | replayed | discarded | archived
  severity  String   @default("transient") // transient | data_inconsistency | validation | business_logic
  queueName String?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)

  @@index([status, createdAt])
  @@index([severity])
  @@map("dead_letters")
}
```

---

## 7. Current Synchronous Flow vs Proposed Async Flow

### 7.1 WhatsApp Order Lifecycle — CURRENT (Sync)

```
Webhook (HTTP POST)
  │
  ▼
CommunicationService.handleMessage()
  │
  ├── ResolveSender()           → DB + WhatsApp API (sync)
  ├── LidMapping.upsert()       → DB (sync)
  ├── retryPendingReplies()     → DB + WhatsApp API (fire-and-forget)
  ├── WhatsAppLog.create()      → DB (sync)
  ├── MessagesService.log()     → DB (sync)
  ├── Customer.lookup()         → DB (sync)
  ├── AI.parseMessage()         → DeepSeek API (sync, 2-5s)
  │
  ├── [if AI order]:
  │   └── OrdersService.createFromAI()
  │       └── $transaction()    → DB (sync, 7 writes)
  │
  ├── [else]:
  │   └── OrderFlowService.handleMessage()
  │       ├── Session.get()     → Redis/Map (sync)
  │       ├── processStep()
  │       │   ├── [confirm] → createOrder() → $transaction()
  │       │   └── [else] → build prompt string (pure)
  │       └── Session.save()    → Redis/Map (sync)
  │
  ├── LidResolver.resolve()     → 5-step waterfall (sync, 15s timeout)
  ├── PendingReply.create() | Session.update()
  ├── WhatsAppService.send()    → HTTP POST to OpenWA (sync)
  ├── MessagesService.log()     → DB (sync)
  └── WhatsAppLog.create()      → DB (sync)

Total: ~25 sequential operations, avg 6-10s per message
Failure at step 15 leaves customer without reply — no compensation
```

### 7.2 WhatsApp Order Lifecycle — PROPOSED (Async)

```
Webhook (HTTP POST)
  │
  ▼
Webhook Controller (lightweight)
  │  Validates payload, extracts remoteJid + message
  │  Emits: message.received
  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      EVENT BUS (BullMQ)                          │
└──────────────────────────────────────────────────────────────────┘
  │
  ├── Consumer: SenderResolver
  │   ├── Resolves @lid → phone via 5-step waterfall
  │   ├── Emits: sender.resolved
  │   └── Response: <1s (async, not blocking customer)
  │
  ├── Consumer: Deduplication
  │   ├── Checks Redis SETNX for messageId
  │   └── Drops duplicate (or emits duplicate-detected)
  │
  ├── Consumer: LidMappingPersister (subscribes to sender.resolved)
  │   ├── LidMapping.upsert()
  │   └── No emit
  │
  ├── Consumer: PendingReplyResolver (subscribes to sender.resolved)
  │   ├── Loads pending replies for this LID
  │   ├── WhatsAppService.send() for each
  │   └── Emits: pending-reply.resolved for each
  │
  ├── Consumer: OrderFlowSessionMigrator (subscribes to sender.resolved)
  │   ├── Checks session tempPhone→realPhone
  │   ├── Migrates if needed
  │   └── Emits: session.recovered
  │
  ├── Consumer: MessageParser (subscribes to message.received)
  │   ├── AI.parseMessage() OR OrderFlow.handleMessage()
  │   ├── Emits: message.parsed
  │   └── Response: 2-5s (parallel with SenderResolver)
  │
  ├── Consumer: OrderCreator (subscribes to message.parsed)
  │   ├── If intent === create_order:
  │   │   ├── Customer.upsert() in $transaction
  │   │   ├── Order.create() in $transaction
  │   │   └── Emits: order.created
  │   └── If intent === order_flow:
  │       └── Emits: whatsapp.send (build next prompt)
  │
  ├── Consumer: OrderFlowResponseBuilder (subscribes to message.parsed)
  │   └── Builds WhatsApp reply from session state
  │
  ├── Consumer: WhatsappSender (subscribes to whatsapp.send)
  │   ├── WhatsAppService.send()
  │   └── If unresolved JID → emit: pending-reply.created
  │
  ├── Consumer: InventoryDeducter (subscribes to order.created)
  │   ├── Load recipe ingredients
  │   ├── Atomic DB stock decrement (WITH stockDeducted guard)
  │   ├── InventoryConsumption.create()
  │   └── Emits: inventory.deducted
  │
  ├── Consumer: WhatsAppNotifier (subscribes to order.created / order.confirmed)
  │   ├── Builds notification template
  │   ├── WhatsAppService.send()
  │   └── No emit
  │
  ├── Consumer: LowStockChecker (subscribes to inventory.deducted)
  │   ├── Check thresholds
  │   └── If low → emit: low-stock.alert (→ notification queue)
  │
  ├── Consumer: WebSocketBroadcaster (subscribes to order.*, payment.*)
  │   ├── Room-based broadcast (cafeId)
  │   └── No emit
  │
  └── Consumer: AnalyticsUpdater (subscribes to order.created, inventory.deducted, payment.collected)
      └── Incremental cache update (no full recompute)

Total: ~8-12 async events, each <200ms processing
Customer gets reply within 2s (first available event)
Heavy operations (inventory, analytics) are eventually consistent
```

### 7.3 Comparison Table

| Aspect | Current (Sync) | Proposed (Async) |
|---|---|---|
| **Response time** | 6-10s (blocking) | 1-2s (fire event, reply comes async) |
| **Coupling** | Tight (God Object) | Loose (each consumer independent) |
| **Error isolation** | One failure kills entire flow | Per-consumer retry + DLQ |
| **Scalability** | Single-thread handled | Parallel consumers (BullMQ concurrency) |
| **Data consistency** | ACID (but long tx) | Eventual (SAGA for multi-step) |
| **Observability** | Logs only | Events for every state change |
| **Testing** | Mock 9 services | Test each consumer in isolation |
| **Deployment risk** | High (any change touches God Object) | Low (add/remove consumers independently) |

---

## 8. SAGA Orchestration

For multi-step workflows that span services, we use **orchestrated SAGA** via the `order-processing` queue.

### 8.1 Order Creation SAGA

```typescript
async function orderSaga(event: MessageParsedPayload) {
  const sagaId = event.correlationId;

  try {
    // Step 1: Resolve/Create Customer
    const customer = await resolveCustomer(event);
    await emitProgress(sagaId, 'customer-resolved', { customerId: customer.id });

    // Step 2: Create Order
    const order = await createOrder(event, customer.id);
    await emitProgress(sagaId, 'order-created', { orderId: order.id });

    // Step 3: Confirm Order (auto-confirm for WhatsApp)
    await confirmOrder(order.id);
    await emitProgress(sagaId, 'order-confirmed', { orderId: order.id });

    // Step 4: Deduct Inventory (async via order.created event)
    // (Inventory consumer handles this independently)

    return { success: true, orderId: order.id };
  } catch (err) {
    await compensateSaga(sagaId, err);
    throw err;
  }
}

async function compensateSaga(sagaId: string, error: Error) {
  const steps = await getProgress(sagaId); // Redis list
  // Reverse each completed step in reverse order
  for (const step of steps.reverse()) {
    switch (step.type) {
      case 'order-created':
        await cancelOrder(step.payload.orderId);
        break;
      case 'customer-resolved':
        // No-op: customer record non-critical
        break;
    }
  }
}
```

### 8.2 SAGA Progress Tracking

```typescript
// Redis key: saga:{sagaId}:steps
// Storage: RPUSH of step names (ordered list)
// TTL: 3600s (cleanup)
```

---

## 9. Implementation Plan (File-Level Changes)

### Phase 1: Foundation (Week 1)

**Goal:** Create event infrastructure without changing existing behavior.

| # | File | Change |
|---|---|---|
| 1 | `backend/src/events/event-schemas.ts` | **NEW** — All 11 event payload interfaces + `EventEnvelope` type + Zod schemas for runtime validation |
| 2 | `backend/src/events/event-bus.service.ts` | **NEW** — Wraps BullMQ `Queue` for event publishing (emits both in-process EventEmitter2 AND persistent queue). Single method: `publish(eventType, payload, options?)`. |
| 3 | `backend/src/events/event-dedup.service.ts` | **NEW** — Generic Redis-based dedup with `SETNX` + TTL, `processWithDedup(key, ttl, fn)` |
| 4 | `backend/src/events/events.module.ts` | **UPDATE** — Register `EventBusService`, `EventDedupService`, export both, import `RedisModule` + `QueueModule` |
| 5 | `backend/src/prisma/schema.prisma` | **UPDATE** — Add `severity` field to `DeadLetter` model |
| 6 | `backend/src/events/saga-orchestrator.service.ts` | **NEW** — Generic SAGA orchestrator: `startSaga(correlationId, steps[])`, `recordProgress(step)`, `compensate(error)` |

### Phase 2: Extract Consumers (Week 2)

**Goal:** Decompose `CommunicationService.handleMessage()` into independent consumers. Existing sync flow remains as fallback behind feature flag.

| # | File | Change |
|---|---|---|
| 7 | `backend/src/communication/communication.controller.ts` | **UPDATE** — Webhook endpoint emits `message.received` event + returns 202 immediately. Old sync flow behind `FEATURE_ASYNC=false` flag. |
| 8 | `backend/src/communication/communication.service.ts` | **UPDATE** — Remove `handleMessage()` orchestration. Keep only: `onApplicationBootstrap()`, `resolveSender()`, `reconcileLidToPhone()`, `retryPendingRepliesForLid()`, `scheduledRetryPendingReplies()` as **private utilities** called only by consumers. |
| 9 | `backend/src/consumers/message-received/sender-resolver.consumer.ts` | **NEW** — Subscribes to `message.received`. Calls `resolveSender()`, emits `sender.resolved`. |
| 10 | `backend/src/consumers/message-received/deduplication.consumer.ts` | **NEW** — Subscribes to `message.received`. Checks Redis + WhatsAppLog. Drops if duplicate. |
| 11 | `backend/src/consumers/sender-resolved/lid-mapping-persister.consumer.ts` | **NEW** — Subscribes to `sender.resolved`. Calls `LidMappingService.upsert()`. |
| 12 | `backend/src/consumers/sender-resolved/pending-reply-resolver.consumer.ts` | **NEW** — Subscribes to `sender.resolved`. Loads + sends pending replies. |
| 13 | `backend/src/consumers/sender-resolved/customer-phone-updater.consumer.ts` | **NEW** — Subscribes to `sender.resolved`. Updates `Customer.phoneJid`. |
| 14 | `backend/src/consumers/sender-resolved/session-migrator.consumer.ts` | **NEW** — Subscribes to `sender.resolved`. Migrates `orderflow:session` from temp to real phone. |
| 15 | `backend/src/consumers/message-received/message-parser.consumer.ts` | **NEW** — Subscribes to `message.received`. Calls `AiService.parseMessage()` or `OrderFlowService.handleMessage()`. Emits `message.parsed`. |
| 16 | `backend/src/consumers/consumers.module.ts` | **NEW** — Registers all 8 consumers, imports all required modules |

### Phase 3: Order Lifecycle Consumers (Week 3)

**Goal:** Extract order creation, inventory deduction, and notification into async consumers.

| # | File | Change |
|---|---|---|
| 17 | `backend/src/consumers/message-parsed/order-creator.consumer.ts` | **NEW** — Subscribes to `message.parsed` (intent=create_order). Calls `OrdersService.createFromAI()`. Emits `order.created`. |
| 18 | `backend/src/consumers/message-parsed/order-flow-response.consumer.ts` | **NEW** — Subscribes to `message.parsed` (intent=order_flow). Calls `OrderFlowService.buildResponse()`. Emits `whatsapp.send`. |
| 19 | `backend/src/consumers/order-created/inventory-deducter.consumer.ts` | **NEW** — Subscribes to `order.created`. Calls `InventoryService.deductRecipeStock()`. Emits `inventory.deducted`. |
| 20 | `backend/src/consumers/order-created/whatsapp-notifier.consumer.ts` | **NEW** — Subscribes to `order.created`. Sends confirmation via `WhatsappService.send()`. |
| 21 | `backend/src/consumers/order-created/analytics-updater.consumer.ts` | **NEW** — Subscribes to `order.created`. Increments daily aggregation counters in Redis for eventual PG sync. |
| 22 | `backend/src/consumers/order-created/websocket-broadcaster.consumer.ts` | **NEW** — Subscribes to `order.created` + `payment.collected` + `order.confirmed`. Room-filtered WS broadcast. |
| 23 | `backend/src/consumers/inventory-deducted/low-stock-checker.consumer.ts` | **NEW** — Subscribes to `inventory.deducted`. Runs threshold check. Emits `low-stock.alert` if needed. |

### Phase 4: Payment & Financial Consumers (Week 3-4)

| # | File | Change |
|---|---|---|
| 24 | `backend/src/consumers/payment-collected/debt-tracker.consumer.ts` | **NEW** — Subscribes to `payment.collected`. Creates/settles debt records. |
| 25 | `backend/src/consumers/payment-collected/driver-settlement.consumer.ts` | **NEW** — Subscribes to `payment.collected` (isDelivery=true). Updates driver earnings. |
| 26 | `backend/src/consumers/payment-collected/financial-recorder.consumer.ts` | **NEW** — Subscribes to `payment.collected`. Creates `FinancialTransaction`. |
| 27 | `backend/src/consumers/payment-collected/customer-updater.consumer.ts` | **NEW** — Subscribes to `payment.collected`. Updates `Customer.unpaidBalance`. |
| 28 | `backend/src/consumers/whatsapp-send/whatsapp-sender.consumer.ts` | **NEW** — Subscribes to `whatsapp.send`. Calls `WhatsAppService.send()`. Emits `pending-reply.created` if unresolved. |

### Phase 5: Reliability & Observability (Week 4)

| # | File | Change |
|---|---|---|
| 29 | `backend/src/queue/queue-bridge.service.ts` | **DELETE** — Replace with direct consumer subscriptions to EventBus. QueueBridge was the old partial event→queue bridge, now superseded. |
| 30 | `backend/src/reliability/dead-letter.service.ts` | **UPDATE** — Add severity classification, auto-replay for transient, manual replay endpoint. |
| 31 | `backend/src/reliability/dead-letter.controller.ts` | **NEW** — `POST /admin/dlq/replay`, `GET /admin/dlq/list`, `POST /admin/dlq/discard` |
| 32 | `backend/src/reliability/health-check.service.ts` | **UPDATE** — Add consumer lag monitoring (BullMQ queue depth per queue). Alert if any queue > 1000. |
| 33 | `backend/src/webhook/webhook.controller.ts` | **NEW** — Standalone lightweight webhook controller (extracted from CommunicationController). Only validates payload and emits `message.received`. Returns 202. |

### Phase 6: Cutover (Week 5)

| # | Action | Description |
|---|---|---|
| 34 | Add `FEATURE_ASYNC` env var (default: `false`) | Rollout with feature flag |
| 35 | Enable on staging for 1 cafe | Observe DLQ, consumer lag, error rates |
| 36 | Fix any issues found in staging | - |
| 37 | Enable on production for 1 cafe | Canary deployment |
| 38 | Gradual rollout to all cafes | 10% → 50% → 100% |
| 39 | Remove sync fallback code | Delete CommunicationService.handleMessage(), old flow paths. Dead code removal after 2 weeks of stability. |

---

## 10. Migration Strategy — Strangler Fig

### Step 1: Dual-Write (Phase 2-3)

Both old sync path **and** new async path run simultaneously:

```typescript
// Webhook controller
@Post('webhook')
async handleIncoming(@Body() body: any) {
  // Fast path: always emit event
  await this.eventBus.publish('message.received', {
    eventId: uuid(),
    payload: extractPayload(body),
  }, {
    queue: 'order-processing',
    dedupKey: body.data?.id || body.messageId,
  });

  // Old path: feature-gated
  if (process.env.FEATURE_ASYNC !== 'true') {
    return this.communicationService.handleMessage(body);
  }

  return { status: 'accepted' }; // 202 Accepted
}
```

### Step 2: Compare Results (Phase 4)

- Consumers log processing time + outcome to a `event_audit_log` table
- Scheduled job compares sync vs async outcomes for correctness (sampled, 1% of messages)
- Alert on any divergence

### Step 3: Async-Only (Phase 6)

- Set `FEATURE_ASYNC=true` for a cafe
- Monitor for 48 hours
- Remove sync code after all cafes migrated

---

## 11. Queue Sizing & Concurrency

| Queue | Concurrency | Workers | Max Queue Depth | Notes |
|---|---|---|---|---|
| `order-processing` | 5 | 2 boxes | 10000 | High-volume, CPU-light |
| `whatsapp` | 10 | 2 boxes | 5000 | External API calls, I/O-bound |
| `inventory` | 3 | 2 boxes | 5000 | DB-heavy, contention-sensitive |
| `inventory-sync` | 5 | 1 box | 5000 | Redis→PG sync, should drain fast |
| `notification` | 10 | 1 box | 10000 | Lightweight, push to WebSocket |
| `financial-processing` | 2 | 2 boxes | 1000 | Must not overload, financial criticality |
| `analytics-processing` | 1 | 1 box | 1000 | Idempotent, low priority |

### Backpressure

- `order-processing` queue depth > 5000: health check `WARN`
- `order-processing` queue depth > 10000: health check `CRITICAL`, auto-scale worker concurrency +5
- `whatsapp` queue depth > 3000: enable rate limiting (5 msg/s per session)
- Any DLQ > 100: PagerDuty alert

---

## 12. Testing Strategy

### Unit Tests
- Each consumer tested in isolation with mocked event bus
- Pure functions (`resolveSender` step extractors) tested with known inputs

### Integration Tests
- `EventBus.publish()` → consumer → DB assertion
- Dedup: same eventId published twice → second is dropped
- DLQ: job fails 3 times → appears in DLQ

### Contract Tests
- Each event schema validated with Zod
- Producer emits schema-compliant payload → consumer parses without error

### Chaos Tests
- Kafka-level tests: consumer crashes mid-processing → event is retried
- DB disconnection → job goes to DLQ → auto-replay when DB recovers
- LID resolution timeout → reply goes to PendingReply → resolved when mapping arrives

---

## 13. Event Schema File (Reference Implementation)

```typescript
// backend/src/events/event-schemas.ts
import { z } from 'zod';

// ── Envelope ──
export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  eventVersion: z.number().int().positive(),
  timestamp: z.string().datetime(),
  source: z.string(),
  cafeId: z.string(),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid(),
  payload: z.record(z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

// ── message.received ──
export const MessageReceivedPayloadSchema = z.object({
  messageId: z.string(),
  remoteJid: z.string(),
  message: z.string(),
  participant: z.string().optional(),
  fromMe: z.boolean(),
  timestamp: z.number(),
});
export type MessageReceivedPayload = z.infer<typeof MessageReceivedPayloadSchema>;

// ── sender.resolved ──
export const SenderResolvedPayloadSchema = z.object({
  remoteJid: z.string(),
  phone: z.string(),
  phoneJid: z.string(),
  resolutionPath: z.enum(['lid_mapping', 'contacts_store', 'session_cache', 'customer_record', 'direct']),
  cafeId: z.string(),
});
export type SenderResolvedPayload = z.infer<typeof SenderResolvedPayloadSchema>;

// ── message.parsed ──
export const MessageParsedPayloadSchema = z.object({
  phone: z.string(),
  message: z.string(),
  intent: z.enum(['create_order', 'order_flow', 'unknown', 'inquiry']),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    items: z.array(z.object({
      name: z.string(), quantity: z.number().int().positive(),
    })).optional(),
    customerName: z.string().optional(),
    notes: z.string().optional(),
    isRepeatOrder: z.boolean().optional(),
  }).optional(),
  cafeId: z.string(),
});
export type MessageParsedPayload = z.infer<typeof MessageParsedPayloadSchema>;

// ── order.created ──
export const OrderCreatedPayloadSchema = z.object({
  orderId: z.string(),
  orderCode: z.string(),
  cafeId: z.string(),
  branchId: z.string(),
  customerId: z.string(),
  customerPhone: z.string(),
  status: z.string(),
  total: z.number(),
  items: z.array(z.object({
    productId: z.string(), productName: z.string(),
    quantity: z.number().int().positive(), unitPrice: z.number(),
    options: z.record(z.string()).optional(),
  })),
  sourceType: z.string(),
  source: z.string(),
  createdAt: z.string().datetime(),
  createdById: z.string().optional(),
  employeeId: z.string().optional(),
});
export type OrderCreatedPayload = z.infer<typeof OrderCreatedPayloadSchema>;

// ── inventory.deducted ──
export const InventoryDeductedPayloadSchema = z.object({
  orderId: z.string(),
  cafeId: z.string(),
  branchId: z.string(),
  deductions: z.array(z.object({
    inventoryId: z.string(), itemName: z.string(),
    quantityDeducted: z.number(), unit: z.string(),
    remainingStock: z.number(), costPerUnit: z.number(), totalCost: z.number(),
  })),
  totalCost: z.number(),
  stockDeductedAt: z.string().datetime(),
});
export type InventoryDeductedPayload = z.infer<typeof InventoryDeductedPayloadSchema>;

// ── payment.collected ──
export const PaymentCollectedPayloadSchema = z.object({
  paymentId: z.string().optional(),
  orderId: z.string(),
  orderCode: z.string(),
  cafeId: z.string(),
  branchId: z.string(),
  amount: z.number(),
  method: z.enum(['CASH', 'CARD', 'WALLET']),
  paymentStatus: z.enum(['PAID', 'PARTIAL_PAYMENT']),
  remainingAmount: z.number(),
  collectedById: z.string(),
  collectedByRole: z.enum(['BARISTA', 'DRIVER', 'OWNER']),
  collectedAt: z.string().datetime(),
  isDelivery: z.boolean(),
});
export type PaymentCollectedPayload = z.infer<typeof PaymentCollectedPayloadSchema>;

// ── pending-reply.created ──
export const PendingReplyCreatedPayloadSchema = z.object({
  pendingReplyId: z.string(),
  lid: z.string(),
  message: z.string(),
  cafeId: z.string(),
  createdAt: z.string().datetime(),
});
export type PendingReplyCreatedPayload = z.infer<typeof PendingReplyCreatedPayloadSchema>;

// ── pending-reply.resolved ──
export const PendingReplyResolvedPayloadSchema = z.object({
  pendingReplyId: z.string(),
  lid: z.string(),
  phoneJid: z.string(),
  resolvedAt: z.string().datetime(),
});
export type PendingReplyResolvedPayload = z.infer<typeof PendingReplyResolvedPayloadSchema>;

// ── webhook.registered ──
export const WebhookRegisteredPayloadSchema = z.object({
  sessionId: z.string(),
  webhookUrl: z.string(),
  success: z.boolean(),
  registeredAt: z.string().datetime(),
  cafeId: z.string().optional(),
});
export type WebhookRegisteredPayload = z.infer<typeof WebhookRegisteredPayloadSchema>;

// ── session.recovered ──
export const SessionRecoveredPayloadSchema = z.object({
  tempPhone: z.string(),
  realPhone: z.string(),
  cafeId: z.string(),
  hadSession: z.boolean(),
  hadPendingReply: z.boolean(),
});
export type SessionRecoveredPayload = z.infer<typeof SessionRecoveredPayloadSchema>;
```
