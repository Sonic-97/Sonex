# Domain Policy Catalog

**Version:** 1.0  
**Status:** Approved  
**Effective:** Phase P0.5  

This catalog documents the official business policies of Sonex Coffee OS.  
Behaviour Specifications (scenarios) verify these policies.  
Implementations satisfy these scenarios.  
This order is mandatory.

---

## Table of Contents

1. [Pricing & Costing](#1-pricing--costing)
2. [Order Status Machine](#2-order-status-machine)
3. [Multi-Tenant Isolation](#3-multi-tenant-isolation)
4. [Employee Management & Attendance](#4-employee-management--attendance)
5. [Inventory Management](#5-inventory-management)
6. [Debt Tracking](#6-debt-tracking)
7. [Payment Processing](#7-payment-processing)
8. [Security & Audit](#8-security--audit)
9. [Order Source Classification](#9-order-source-classification)
10. [Employee KPI & Customer](#10-employee-kpi--customer)

---

## 1. Pricing & Costing

### 1.1 Product Cost Estimation (`computeProductCost`)

**Policy:** A product's base cost is the sum of its ingredients (with waste markup) plus packaging, scaled by a size adjustment factor. If no recipe exists, the product's manual cost field is used.

```
IF ingredients list is NOT empty:
    IngredientCost = Σ [ quantity × (1 + wastePercent/100) × costPerUnit ]
ELSE:
    IngredientCost = productCost

PackagingCost = Σ [ quantity × costPerUnit ]

Total = (IngredientCost + PackagingCost) × costPercent / 100
```

| Variable | Source | Default |
|---|---|---|
| `wastePercent` | RecipeIngredient.wastePercent | 0 |
| `costPerUnit` | Inventory.costPerUnit | required |
| `costPercent` | ProductSize.costPercent | 100 |
| `productCost` | Product.cost | required |

**Rounding:** Raw f64 — no rounding applied.

**References:**
- Implementation: `sonex-core/src/lib.rs:78-103`
- Backend delegate: `backend/src/product-management/product-management.service.ts:457-470`
- Scenarios: `costing-001` through `costing-008`

---

### 1.2 Five-Component Cost Breakdown (`computeCostBreakdown`)

**Policy:** Every product's cost can be decomposed into five components for profitability analysis. All components round to 2 decimal places.

```
IngredientCost     = Σ [ quantity × costPerUnit ]
LaborCost          = (totalLaborCost / totalOrders) × (productOrderCount / MAX(totalItemsSold, 1))
                    [0 if totalOrders=0 or totalItemsSold=0]
OperationalCost    = (totalOperationalExpenses × 0.5) / totalItemsSold [0 if totalItemsSold=0]
UtilityCost        = totalUtilityCost / totalItemsSold [0 if totalItemsSold=0]
MiscellaneousCost  = (totalOperationalExpenses × 0.5) / totalItemsSold [0 if totalItemsSold=0]

EstimatedCost      = IngredientCost + LaborCost + OperationalCost + UtilityCost + MiscellaneousCost
EstimatedProfit    = SellingPrice - EstimatedCost
ProfitMargin       = (EstimatedProfit / SellingPrice) × 100 [0 if SellingPrice=0]
```

**Rounding:** All 6 component fields + aggregated fields rounded to 2 decimal places via `(v × 100).round() / 100`.

**References:**
- Implementation: `sonex-core/src/lib.rs:108-178`
- Backend delegate: `backend/src/product-management/product-management.service.ts:846-943`
- Duplicate: `backend/src/financial-engine/financial-engine.service.ts:242-346` (identical formulas)
- Scenarios: `costing-009` through `costing-013`

---

### 1.3 Labor Cost Allocation by Salary Type

**Policy:** Staff labor cost is allocated per attendance record based on salary type.

| salaryType | Cost per Attendance |
|---|---|
| `HOURLY` | hours × hourlyWage (falls back to hours × salary) |
| `DAILY` | salary (flat daily rate) |
| `MONTHLY` (default) | salary / daysInMonth |

Where `daysInMonth = new Date(year, month+1, 0).getDate()`.

**References:**
- Implementation: `backend/src/product-management/product-management.service.ts:872-901`

---

### 1.4 Expense Split for Cost Allocation

**Policy:** Total operational expenses are split equally: 50% allocated as Operational Cost, 50% allocated as Miscellaneous Cost. Utility expenses are tracked separately per line item.

```
OperationalCost   = totalExpenses × 0.5 / totalItemsSold
MiscellaneousCost = totalExpenses × 0.5 / totalItemsSold
UtilityCost       = utilityExpenses / totalItemsSold
```

**Utility categories:** `'كهرباء'`, `'مياه'`, `'غاز'`, `'Utilities'`, `'utility'`

**References:**
- Implementation: `backend/src/product-management/product-management.service.ts:903-930`

---

### 1.5 Size-Based Pricing Adjustment

**Policy:** Products can have size variants. Each size defines a `priceAdjust` (added to base price) and a `costPercent` (percentage multiplier for cost calculation).

```
SellingPrice = basePrice + priceAdjust
Cost         = baseCost × costPercent / 100
```

**Defaults:** `priceAdjust = 0`, `costPercent = 100`

**References:**
- Schema: `backend/prisma/schema.prisma:432-448`
- DTO: `backend/src/product-management/dto/product.dto.ts:157-177`

---

### 1.6 Price/Cost Change Audit

**Policy:** Every price or cost change on a product must be recorded in `PriceChangeLog` with old and new values, timestamp, and reason.

- Price-only change: logs oldPrice/newPrice (reason: `'Price update'`)
- Cost-only change: logs oldPrice/newPrice + oldCost/newCost (reason: `'Cost update'`)
- Both change: logs both

**References:**
- Implementation: `backend/src/product-management/product-management.service.ts:170-233`

---

### 1.7 Recipe Versioning

**Policy:** Every recipe change creates a new `RecipeVersion` with an auto-incrementing version number, a full JSON snapshot of the recipe, and the computed total cost.

**References:**
- Implementation: `backend/src/product-management/product-management.service.ts:393-456`

---

### 1.8 Low Profit Margin Threshold

**Policy:** Products with `profitMargin < 15%` are considered low-margin. The dashboard displays a warning count.

**References:**
- Implementation: `backend/src/dashboard/dashboard.service.ts:57-93`

---

## 2. Order Status Machine

### 2.1 Delivery Order States and Transitions

**Policy:** Delivery orders follow a linear state machine with 9 states. Each transition requires a specific role. Invalid transitions and unauthorized roles are rejected.

**Initial State:** `NEW`

```
NEW ──(BARISTA/Cafe)──> CONFIRMED ──(BARISTA/Cafe)──> PREPARING
  │                                                       │
  │                                                       ▼
  │                                               (BARISTA/Cafe)
  │                                                       │
  │                                                       ▼
  │                                                  READY
  │                                                    │
  │                                          (DELIVERY/Cafe)
  │                                                    │
  │                                                    ▼
  │                                               PICKED_UP
  │                                                    │
  │                                          (DELIVERY/Cafe)
  │                                                    │
  │                                                    ▼
  │                                               DELIVERED
  │                                                    │
  │                                   (DELIVERY/BARISTA/Cafe)
  │                                                    │
  │                                                    ▼
  │                                                PAID
  │                                                    │
  │                                         (Cafe/BARISTA)
  │                                                    │
  │                                                    ▼
  │                                               CLOSED
  │
  Any non-terminal ──(any role)──> CANCELLED
```

| Transition | Allowed Roles | Side Effects |
|---|---|---|
| `NEW → CONFIRMED` | BARISTA, Cafe | `confirmedAt`, inventory deduction |
| `CONFIRMED → PREPARING` | BARISTA, Cafe | `preparedAt` |
| `PREPARING → READY` | BARISTA, Cafe | `readyAt`, emit `order.ready` |
| `READY → PICKED_UP` | DELIVERY, Cafe | `pickedUpAt` |
| `PICKED_UP → DELIVERED` | DELIVERY, Cafe | `deliveredAt`, emit `order.delivered` |
| `DELIVERED → PAID` | DELIVERY, BARISTA, Cafe | `paidAt`, `paymentStatus='PAID'`, emit `payment.collected` |
| `PAID → CLOSED` | Cafe, BARISTA | `closedAt` (terminal) |
| Any → `CANCELLED` | No role check required | `cancelledAt`, inventory release, stock restore |

**Terminal states:** `CLOSED`, `CANCELLED` — no further transitions allowed.

**Validation chain (in order):**
1. Order existence
2. Cafe ownership (cafeId match)
3. Branch ownership (branchId match)
4. Same status guard (idempotent — logs warning, returns unchanged)
5. Valid transition (looked up in NEXT_STATUS map)
6. Role authorization (userRole in allowedRoles)
7. Optimistic concurrency (version field comparison)

**References:**
- State machine definition: `backend/src/orders/order-status.service.ts:11-21`
- Validation implementation: `backend/src/orders/order-status.service.ts:36-171`
- Role mapping: uses `'Cafe'` (for OWNER) and `'DELIVERY'` (for DRIVER)
- Scenarios: NONE YET (Phase P1)

---

### 2.2 In-Cafe Order States

**Policy:** In-cafe orders follow a simpler linear flow with 5 states plus a void terminal state. No role guards on transitions.

```
NEW → PREPARING → READY → DELIVERED → COMPLETED
  ↘ VOID (any status)
```

**Transition map:** `NEW: ['PREPARING']`, `PREPARING: ['READY']`, `READY: ['DELIVERED']`, `DELIVERED: ['COMPLETED']`, `COMPLETED: []`

**Void policy:** A voided order cannot be modified (no payment updates, no status changes).

**References:**
- Implementation: `backend/src/in-cafe/in-cafe.service.ts`
- Scenarios: NONE YET

---

### 2.3 Driver-Specific Shortcuts

**Policy:** Drivers can bypass the standard state machine through dedicated methods.

| Method | Action | Status Validation |
|---|---|---|
| `acceptOrder` | Assigns driver to a READY order | Order must be READY |
| `pickupOrder` | READY → PICKED_UP | Order must be READY, driverId must match |
| `assignToOrder` | Any status → PICKED_UP | **No status check (gap)** |
| `completeDelivery` | Any status → DELIVERED | **No status check (gap)** |
| `collectPayment` | DELIVERED → PAID | Must be DELIVERED, driverId must match |

**Known gaps:** `assignToOrder` and `completeDelivery` do not validate current status before transitioning.

**References:**
- Implementation: `backend/src/drivers/drivers.service.ts`

---

### 2.4 Order Creation Defaults

**Policy:** Orders are created with these defaults:

| Field | Default |
|---|---|
| `status` | `NEW` |
| `version` | `1` |
| `sourceType` | `INSIDE_CAFE` |
| `source` | `IN_CAFE` |
| `branchId` | First branch with slug `main-branch` |
| `code` | `CAF-YYYYMMDD-<base36>` |

**Required fields:** `items` (≥1), `customerId` or `customerPhone`

**References:**
- Implementation: `backend/src/orders/orders.service.ts:41-244`

---

## 3. Multi-Tenant Isolation

### 3.1 Guard Chain

**Policy:** Every authenticated request passes through three guards in sequence. All guards skip if `@Public()` is present.

```
CafeGuard → JwtAuthGuard → BranchContextGuard
```

### 3.2 Cafe Isolation

**Policy:** Every data record is owned by exactly one cafe. All cross-entity queries must filter by cafeId. All read/update/delete-by-ID operations must verify ownership.

**Verification pattern (TypeScript):**
```
if (cafeId && entity.cafeId !== cafeId) throw ForbiddenException
```

**Verification helper (where applied):**
```
verifyOwnership<T>(entity, cafeId, name): entity | throw
```

**Applied to:** ProductManagementService (25+ methods), ProductsService, OrdersService, DriversService (13), InventoryService, StaffService, InCafeService, PaymentService, AttendanceService

**References:**
- Guard: `backend/src/common/guards/cafe.guard.ts`
- Helper: `backend/src/product-management/product-management.service.ts`
- All services listed in AGENTS.md

### 3.3 Branch Isolation

**Policy:** Employees (BARISTA, DRIVER) are assigned to a single branch. They can only access data for their assigned branch. Owners can view all branches.

- Owner `x-branch-id = 'all'` → `branchId = undefined` (all branches)
- Employee branch mismatch → ForbiddenException

**References:**
- Guard: `backend/src/common/guards/branch-context.guard.ts`

### 3.4 Role Definitions

**Policy:** Four roles exist with hierarchical access:

| Role | Access Scope |
|---|---|
| `SUPER_ADMIN` | Bypasses all cafe isolation |
| `OWNER` | Full access within own cafe |
| `BARISTA` | Branch-scoped, order processing |
| `DRIVER` | Branch-scoped, delivery/payment |

**References:**
- RolesGuard: `backend/src/common/guards/roles.guard.ts`
- JWT payload: `{ sub, role, phone, branchId, cafeId }`

### 3.5 Known Gaps

**Policy (unenforced):** The following services have NOT been audited for cafeId filtering:
- Analytics services (7 services: staff, sales, revenue, driver, customer, business-insights, aggregator)
- Order Status Service (checks branchId but not cafeId)
- Closing / Reports / Expenses / Financial controllers

**References:**
- AGENTS.md under "Remaining Gaps"

---

## 4. Employee Management & Attendance

### 4.1 Employee Roles

**Policy:** Valid employee roles are `OWNER`, `BARISTA`, `DRIVER`, and `SUPER_ADMIN` (system-level). Role is stored as a free-text string.

### 4.2 Employee Login

**Policy:** Employees authenticate with their login code plus either a password (new accounts) or phone number (legacy fallback).

- **Password mode:** `bcrypt.compare(password, employee.password)`
- **Phone fallback:** Direct string comparison `employee.phone === phone`
- Staff must be `active === true`
- Throws `UnauthorizedException` on failure

**Owner login:** Uses `ownerCode` + `ownerPassword` (bcrypt) on the Cafe model.

**References:**
- Implementation: `backend/src/auth/auth.service.ts`
- DTO: `backend/src/auth/dto/employee-login.dto.ts`

### 4.3 Staff Creation

**Policy:** Staff records must have a globally unique phone number and cafe-unique login code.

- **Phone:** Globally unique → `BadRequestException('Phone already registered')`
- **Login code:** Auto-generated if not provided: `DR-XXXXX` (DRIVER) or `BR-XXXXX` (other roles)
- **Default password:** None (must be set via `POST /staff/:id/set-password`)
- **Branch:** Auto-assigned to cafe's `main-branch`
- **Transaction:** Creation runs in `$transaction` with audit logging

**References:**
- Implementation: `backend/src/staff/staff.service.ts:create()`
- DTO: `backend/src/staff/dto/create-staff.dto.ts`

### 4.4 Attendance Clock-In/Out

**Policy:** Staff clock in at the start of their shift and clock out at the end.

**Clock-In:**
- One active shift per day per staff → rejects if already clocked in
- Creates `Attendance(clockIn=now, date=today, status=ACTIVE)`
- Creates `CashHandover(status=ACTIVE, shiftStart=now, expectedCash=0)`

**Clock-Out:**
- Requires an ACTIVE attendance → rejects if not clocked in
- `totalHours = (clockOut - clockIn) / (1000 × 60 × 60)`, rounded to 2 decimal places
- Sets `status = COMPLETED`

**References:**
- Implementation: `backend/src/attendance/attendance.service.ts`
- Schema: `backend/prisma/schema.prisma` — Attendance model

### 4.5 Late Arrival Rule

**Policy:** An attendance is considered late if `clockIn hour > 10`. Clock-in between 9 and 10 (inclusive) is on time.

**References:**
- Implementation: `backend/src/attendance/attendance.service.ts:getAttendanceSummary()`

### 4.6 Attendance Cost Calculation

**Policy:** Attendance cost is calculated per staff per month based on salary type.

| Salary Type | Daily Cost | Monthly Cost |
|---|---|---|
| `DAILY` | = salary | = dailyCost × daysWorked |
| `HOURLY` | = hourlyWage × (totalHours / daysWorked) | = hourlyWage × totalHours |
| `MONTHLY` | = monthlyCost / totalOperationalDays | = salary |

**References:**
- Implementation: `backend/src/attendance/attendance.service.ts:getAttendanceSummary()`

---

## 5. Inventory Management

### 5.1 Core Inventory Fields

**Policy:** Each inventory item tracks current quantity, reserved quantity, minimum threshold, and unit cost.

| Field | Purpose |
|---|---|
| `currentQty` | Current stock on hand |
| `reservedQty` | Quantity reserved for active orders |
| `minThreshold` | Alert threshold for low stock |
| `costPerUnit` | Unit cost for recipe costing |
| `version` | Optimistic lock version (starts at 1) |

### 5.2 Refill Stock

**Policy:** Refilling stock creates an inventory purchase record, an expense record, a stock sync log, and a stock ledger entry.

**Preconditions:**
- `quantity > 0` and finite
- Item exists and cafeId matches
- Branch must exist (falls back to first branch of cafe)

**Side effects (all within same request):**
1. `currentQty += quantity`, version incremented
2. InventoryPurchase record created
3. Expense record created (category: `'Inventory Purchase'`)
4. InventorySyncLog entry created
5. StockLedger entry created (reason: `'refill'`)
6. Audit log written

**References:**
- Implementation: `backend/src/inventory/inventory.service.ts:refillStock()`

### 5.3 Stock Reservation

**Policy:** When an order is placed, ingredient stock is reserved. On confirmation, stock is deducted. On cancellation/release, stock is restored.

**Reservation flow:**
1. **Reserve:** `available = currentQty - reservedQty`. If `available < neededQty` → error. Creates StockReservation(ACTIVE).
2. **Confirm:** `currentQty -= quantity`, `reservedQty -= quantity`. Creates InventoryConsumption.
3. **Release:** If ACTIVE: only reduce reservedQty. If CONFIRMED: restore `currentQty += quantity`.

**Optimistic lock:** Uses 3-retry pattern with version field.

**References:**
- Implementation: `backend/src/inventory/inventory.service.ts:reserveStock()`, `confirmReservation()`, `releaseReservation()`

### 5.4 Low Stock Alerting

**Policy:** Low stock alerting has two severity levels:

| Condition | Severity | Action |
|---|---|---|
| `currentQty <= minThreshold` | Critical | Creates Notification + emits `low_stock.alert` |
| `currentQty <= minThreshold × 2` | Warning | Emits `low_stock.alert` only |

### 5.5 Inventory-Stock Syncing for Refrigerated Products

**Policy:** Refrigerated products auto-create and sync with an inventory record at `unit='piece'`.

- On product creation with `isRefrigerated=true`: auto-creates Inventory record
- On `refrigeratorStock` update: syncs to `inventory.currentQty`
- Converting non-refrigerated to refrigerated: auto-creates inventory link

**References:**
- Implementation: `backend/src/product-management/product-management.service.ts:90-288`
- Schema: `backend/prisma/schema.prisma` — Product.refrigeratorInventoryId

### 5.6 Stock Deduction on Order

**Policy:** When an order is confirmed, recipe ingredients are deducted from inventory.

```
FOR each OrderItem:
    FOR each RecipeIngredient of product:
        totalNeeded = recipe.quantity × orderItem.quantity
        IF inventory.currentQty < totalNeeded → throw (insufficient stock)
        currentQty -= totalNeeded
```

**References:**
- Implementation: `backend/src/product-management/product-management.service.ts:808-842`

---

## 6. Debt Tracking

### 6.1 What Constitutes Debt

**Policy:** Debt arises from three sources:

| Source | Condition |
|---|---|
| Delivery order | `remainingAmount > 0` after payment |
| In-cafe order | `paymentStatus !== 'PAID'` and `status !== 'VOID'` |
| Explicit Debt record | Created on partial payment with reason |

### 6.2 In-Cafe Debt Summary

**Policy:** Unpaid in-cafe orders are grouped by customer name, sorted by total owed descending.

- Filters: `paymentStatus !== 'PAID'`, `status !== 'VOID'`
- Per customer: `totalOwed` (sum of remainingBalance), `orderCount`, `oldestUnpaidDate`
- Overall: `totalUnpaid`, `customerCount`

### 6.3 Unified Debt Overview

**Policy:** The unified view combines three data sources grouped by customer (customerId must exist):

1. Debt table (unsettled debts)
2. InCafeOrder table (unpaid orders)
3. Order table (unpaid delivery orders)

Output: customers sorted by totalDebt descending, with `totalOutstanding` and `customerCount`.

### 6.4 Debt Settlement

**Policy:** A debt is settled by recording the settlement with a timestamp and settler ID, then decrementing the customer's unpaid balance.

**Side effects:**
1. `Debt.settled = true`, `settledAt = now()`, `settledById`
2. `Customer.unpaidBalance -= debt.amount`
3. Audit log with `action = 'DEBT_SETTLE'`
4. Emits `debt.settled` + `DEBT_PAID`

**References:**
- All debt policies: `backend/src/payments/payment.service.ts`, `backend/src/in-cafe/in-cafe.service.ts`

---

## 7. Payment Processing

### 7.1 Payment Status Values

**Policy:** Payment status differs by order type.

| Order Type | Status Values |
|---|---|
| Delivery | `UNPAID` (default), `PARTIAL_PAYMENT`, `PAID` |
| In-Cafe | `NOT_PAID` (default), `PARTIALLY_PAID`, `PAID`, `VOID` |

### 7.2 Mark Order Payment

**Policy:** When marking an order as paid:
- `amountPaid` defaults to `order.total`
- `remainingAmount = MAX(0, total - amountPaid)`
- If CASH payment by BARISTA: increments `staff.currentCashWallet`
- Creates `PaymentLog` and `FinancialTransaction`

### 7.3 Void Order (In-Cafe)

**Policy:** Voiding an in-cafe order:
- Cannot void already voided orders
- **Cash refund rule:** If `isPaid AND paymentMethod === 'CASH' AND hoursSinceOrder <= 12`: decrements staff's `currentCashWallet` by `paidAmount`
- **Financial reversal:** Creates `FinancialTransaction(type='income_void', amount=-paidAmount)`
- **Stock restoration:** Restores refrigerator stock + releases inventory reservations

### 7.4 Daily Closing

**Policy:** Daily closing aggregates payments by collector (barista or driver) for a date range:
- **Barista:** Cash vs. card split by payment method
- **Driver:** Total collected, payments, associated orders
- **Reconciliation:** Groups cash payments by `collectedById` across all baristas

---

## 8. Security & Audit

### 8.1 Authentication

**Policy:** All authenticated requests require a valid JWT access token in the `Authorization: Bearer <token>` header.

- **Token signing:** `JWT_ACCESS_SECRET` (fallback: `'fallback-secret'`)
- **Access token expiry:** `15m` (configurable via `ACCESS_TOKEN_EXPIRY`)
- **Refresh token:** Separate secret, 7-day expiry, stored in DB, rotated on use
- **JWT payload:** `{ sub, role, phone, branchId, cafeId }`

### 8.2 Authorization

**Policy:** Access control is enforced through:
- `CafeGuard`: Rejects cross-cafe access
- `BranchContextGuard`: Rejects cross-branch access for employees
- `RolesGuard`: Rejects unauthorized roles
- `@Public()`: Bypasses all guards (for login, health, etc.)

### 8.3 Audit Logging

**Policy:** All data modifications must be logged with before/after state, actor identity, and timestamp.

**Audit log fields:** `action`, `entityType`, `entityId`, `beforeState`, `afterState`, `actorId`, `actorRole`, `cafeId`, `metadata`

---

## 9. Order Source Classification

**Policy:** Every order has a `sourceType` field classifying where the order originated.

| Source Type | Description |
|---|---|
| `INSIDE_CAFE` | Order placed in-person at the cafe |
| `OUTSIDE_CAFE` | Order placed for delivery/takeaway |
| `WHATSAPP_ORDER` | Order placed via WhatsApp |

**Default:** `INSIDE_CAFE` on order creation.

**References:**
- Schema: `backend/prisma/schema.prisma` — `Order.sourceType`, `InCafeOrder.sourceType`
- Implementation: `backend/src/in-cafe/in-cafe.service.ts` (create)
- Frontend: POS source selector with 3 tabs

---

## 10. Employee KPI & Customer

**Policy:** Orders can be attributed to a specific employee who "brought" the order (the staff member serving the customer). This attribution feeds into employee performance metrics.

**KPI Score formula (per employee, per period):**

```
totalOrders   = COUNT of orders where employeeId = staff.id
paidOrders    = COUNT of orders where employeeId = staff.id AND paymentStatus = 'PAID'
revenue       = SUM of order totals where employeeId = staff.id AND paymentStatus = 'PAID'
KPI Score     = paidOrders / totalOrders × 100
```

**References:**
- Schema: `backend/prisma/schema.prisma` — `Order.employeeId`, `InCafeOrder.employeeId`, `Staff.broughtOrders`, `Staff.broughtInCafeOrders`
- Implementation: `backend/src/orders/orders.service.ts:getEmployeeKpi()`
- Frontend: `/owner/employee-kpi` page

### 8.4 Customer Memory & Autocomplete

**Policy:** Customer records are auto-created when an order is placed with a new phone number. Customer name search is available for autocomplete during order creation.

- **Auto-create:** On order creation, if `customerPhone` doesn't match an existing customer, upsert creates a new record.
- **Search:** `GET /customers/search?q=` returns matching customers by name (case-insensitive, within cafe).
- **Autocomplete triggers:** POS customer name input queries search endpoint on user input.

**References:**
- Implementation: `backend/src/customers/customers.service.ts`

---

## Appendix A: Policy-to-Scenario Mapping

| Policy # | Policy Name | Verifying Scenarios | Status |
|---|---|---|---|
| 1.1 | Product Cost Estimation | `costing-001` through `costing-008` | Verified |
| 1.2 | Five-Component Cost Breakdown | `costing-009` through `costing-013` | Verified |
| 1.3–1.8 | Pricing & Costing (remaining) | NONE | Not yet verified |
| 2.1 | Delivery Order Status Machine | NONE | Phase P1 |
| 2.2 | In-Cafe Order States | NONE | Phase P1 |
| 3.1–3.5 | Multi-Tenant Isolation | NONE | Phase P1 |
| 4.1–4.6 | Employee & Attendance | NONE | Future |
| 5.1–5.6 | Inventory Management | NONE | Future |
| 6.1–6.4 | Debt Tracking | NONE | Future |
| 7.1–7.4 | Payment Processing | NONE | Future |
| 8.1–8.3 | Security & Audit | NONE | Future |
| 9 | Order Source Classification | NONE | Future |
| 10.1 | Employee KPI Tracking | NONE | Future |
| 10.2 | Customer Memory & Autocomplete | NONE | Future |

## Appendix B: Known Policy Gaps

| Gap | Description | Priority |
|---|---|---|
| Driver shortcut bypass | `assignToOrder`/`completeDelivery` skip status validation | Medium |
| Cancellation bypass | `cancel()` has no role check, any authenticated user can cancel any order | High |
| Analytics isolation | 7 analytics services lack cafeId filtering | High |
| Order Status cafeId | `updateOrderStatus` checks branchId but not cafeId | Medium |
| Closing/Reports/Expenses | Controllers not audited for cafeId | Medium |

---

*End of Domain Policy Catalog v1.0*
