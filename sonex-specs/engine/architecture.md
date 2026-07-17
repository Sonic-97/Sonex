# Behaviour Runner V1 — Architecture

**Version:** 2.0  
**Phase:** P1.5  
**Status:** Design  
**Scope:** Thin runner design, JSON format, migration plan

---

## Design Philosophy

No framework. No generic engine. No platform abstraction. No HTTP test endpoints.

Every scenario is executed the same way:

1. Read JSON
2. Map action to service call
3. Assert result

The JSON specification is the contract. The runner is a thin switch-case. Nothing more.

```
JSON scenario file
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│ Backend Runner   │     │ Desktop Runner    │
│ (Jest +          │     │ (cargo test +     │
│  TestingModule)  │     │  Rust functions)  │
│                  │     │                   │
│ Calls services   │     │ Calls functions   │
│ directly via DI  │     │ directly          │
│ Asserts via Jest │     │ Asserts via       │
│                  │     │ assert_eq!        │
└──────────────────┘     └──────────────────┘
       │                        │
       └──────────┬─────────────┘
                  ▼
       Both read the same JSON files
       Business behaviour is the contract
```

---

## 1. Runner Architecture

### 1.1 Backend Runner

A single Jest test file per domain:

```
backend/src/sonex-specs/
  runner/
    order-lifecycle.runner.spec.ts    ← one test file
    order-status.runner.spec.ts       ← one test file
    ...
```

Each test file:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { OrdersService } from '../orders/orders.service';
// ... other services

const SCENARIOS = load('../../../sonex-specs/scenarios/orders/order-creation.json');

describe('ORD-001 Order Creation', () => {
  let module: TestingModule;
  let ctx: Context;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  beforeEach(() => { ctx = new Context(); });

  test.each(SCENARIOS)('$scenario.id: $scenario.description', async (scenario) => {
    // 1. Setup given — create entities via real services
    await setupGiven(module, scenario.given, ctx);

    // 2. Execute — map action to service call
    const result = await execute(module, scenario.when, ctx);

    // 3. Assert — compare result + state against then block
    assertThen(result, scenario.then, ctx);
  });
});
```

**Key decisions:**
- Uses `TestingModule` — starts NestJS with real services, no HTTP
- Each `execute()` is a **switch statement** mapping `action` → `service.method()`
- No capability registry — just a function with `switch (action)`
- `ctx` is a plain `Map<string, any>` — not a generic state manager
- `setupGiven()` calls real service `create()` methods — not test endpoints

### 1.2 Desktop Runner

A single Rust test module per domain:

```
desktop/src-tauri/src/sonex_specs/
  runner/
    order_lifecycle.rs      ← one test module
    order_status.rs         ← one test module
    mod.rs                  ← re-exports
```

Each test module:

```rust
#[cfg(test)]
mod order_creation_tests {
    use super::*;
    use crate::orders_service::OrdersService;
    use serde_json::Value;

    #[test]
    fn run_order_creation_scenarios() {
        let scenarios = load_scenarios("../../sonex-specs/scenarios/orders/order-creation.json");
        let mut ctx = Context::new();

        for scenario in scenarios {
            ctx.reset();

            // 1. Setup given — create entities via real functions
            setup_given(&scenario.given, &mut ctx);

            // 2. Execute — match action to function call
            let result = execute(&scenario.when, &ctx);

            // 3. Assert — compare against then block
            assert_then(result, &scenario.then, &ctx);
        }
    }
}
```

**Key decisions:**
- Uses `#[test]` — standard Rust unit tests, no framework
- Each `execute()` is a **match statement** mapping `action` → `function_call()`
- No adapter trait — just a function with `match action`
- `ctx` is a plain `HashMap<String, Value>` — no generic state manager
- Only business functions shared with the real app are called

---

## 2. Execution Model

### 2.1 execute() is a simple switch

**Backend:**
```typescript
async function execute(module: TestingModule, when: WhenBlock, ctx: Context): Promise<any> {
  const params = resolveRefs(when.with, ctx);  // replace $ref with context values

  switch (when.action) {
    case 'createOrder':
      const svc = module.get(OrdersService);
      return svc.create(params.items, params.customer, params.sourceType);

    case 'transitionOrderStatus':
      const statusSvc = module.get(OrderStatusService);
      return statusSvc.update(params.orderId, params.toStatus, { role: params.role });

    case 'cancelOrder':
      const cancelSvc = module.get(OrdersService);
      return cancelSvc.cancel(params.orderId, { role: params.role, cafeId: params.cafeId });

    case 'collectPayment':
      const paySvc = module.get(PaymentsService);
      return paySvc.collect(params.orderId, params.amount, params.method, params.role);

    case 'voidOrder':
      const inCafeSvc = module.get(InCafeService);
      return inCafeSvc.void(params.orderId, params.role);

    case 'modifyOrder':
      return module.get(OrdersService).modify(params.orderId, params.modifications);

    case 'checkPermission':
      return { allowed: checkRolePermission(params.role, params.action) };

    case 'computeProductCost':
      return module.get(ProductManagementService).computeProductCost(params.ingredients,
        params.packaging, params.productCost, params.costPercent);

    case 'computeCostBreakdown':
      return module.get(ProductManagementService).getCostBreakdown(params);

    case 'mapTerminalStatus':
      return { equivalent: params.inCafeStatus === 'COMPLETED' && params.deliveryEquivalent === 'CLOSED' };

    default:
      throw new Error(`Unknown action: ${when.action}`);
  }
}
```

**Desktop:**
```rust
fn execute(when: &WhenBlock, ctx: &Context) -> ActionResult {
    let params = resolve_refs(&when.with, ctx);

    match when.action.as_str() {
        "createOrder" => {
            let svc = OrdersService::new();
            ActionResult::from(svc.create(params["items"], params["customer"], params["sourceType"]))
        }
        "transitionOrderStatus" => {
            let mut svc = OrderStatusService::new();
            ActionResult::from(svc.update(params["orderId"], params["toStatus"], params["role"]))
        }
        "cancelOrder" => {
            let svc = OrdersService::new();
            ActionResult::from(svc.cancel(params["orderId"], params["role"], params["cafeId"]))
        }
        "collectPayment" => {
            let svc = PaymentsService::new();
            ActionResult::from(svc.collect(params["orderId"], params["amount"], params["method"]))
        }
        "computeProductCost" => {
            ActionResult::number(compute_product_cost(
                &params["ingredients"], &params["packaging"],
                params["productCost"].as_f64(), params["costPercent"].as_f64()
            ))
        }
        // ...
        _ => panic!("Unknown action: {}", when.action)
    }
}
```

### 2.2 setupGiven() creates entities via real services

**Backend:**
```typescript
async function setupGiven(module: TestingModule, given: GivenBlock, ctx: Context): Promise<void> {
  for (const entity of given.entities || []) {
    switch (entity.type) {
      case 'cafe':
        const cafe = await module.get(CafeService).create(entity.attributes);
        ctx.set(entity.ref, cafe.id);
        break;
      case 'product':
        const product = await module.get(ProductsService).create({
          ...entity.attributes,
          cafeId: ctx.get(entity.attributes.cafeRef),
        });
        ctx.set(entity.ref, product.id);
        break;
      case 'staff':
        const staff = await module.get(StaffService).create({
          ...entity.attributes,
          cafeId: ctx.get(entity.attributes.cafeRef),
        });
        ctx.set(entity.ref, staff.id);
        break;
      // ... one case per entity type
    }
  }
}
```

**Desktop:**
```rust
fn setup_given(given: &GivenBlock, ctx: &mut Context) {
    for entity in given.entities.iter() {
        match entity.entity_type.as_str() {
            "cafe" => {
                let cafe = CafeService::create(&entity.attributes);
                ctx.insert(entity.ref.clone(), Value::String(cafe.id));
            }
            "product" => {
                let cafe_id = ctx.get(&entity.attributes["cafeRef"].as_str().unwrap());
                let mut attrs = entity.attributes.clone();
                attrs["cafeId"] = cafe_id.clone();
                let product = ProductsService::create(&attrs);
                ctx.insert(entity.ref.clone(), Value::String(product.id));
            }
            // ...
        }
    }
}
```

### 2.3 assertThen() compares result against expectations

```typescript
function assertThen(actual: any, then: ThenBlock, ctx: Context): void {
  // Assert status
  if (then.status) expect(actual.status).toBe(then.status);

  // Assert error (failure scenarios)
  if (then.error) {
    expect(actual.error?.type).toBe(then.error.type);
    expect(actual.error?.message).toMatch(then.error.message);
    return;  // no further assertions on failed action
  }

  // Assert fields
  for (const [key, value] of Object.entries(then.fields || {})) {
    if (typeof value === 'string' && value.includes('*')) {
      expect(actual[key]).toMatch(wildcardToRegex(value));
    } else {
      expect(actual[key]).toEqual(value);
    }
  }

  // Assert events
  for (const event of then.events || []) {
    expect(actual.events).toContainEqual(event);
  }

  // Assert side effects
  for (const [effect, expected] of Object.entries(then.sideEffects || {})) {
    const actualEffect = checkEffect(effect, actual, ctx);
    expect(actualEffect).toBe(expected);
  }

  // Assert entity state
  if (then.entityState) {
    const entity = lookupEntity(then.entityState, ctx);
    for (const [key, value] of Object.entries(then.entityState.fields || {})) {
      expect(entity[key]).toEqual(value);
    }
  }
}
```

---

## 3. JSON Format

### 3.1 Format (unchanged from current design)

The full v2 format from the previous design is retained — it is the contract:

```json
{
  "version": 2,
  "targets": ["backend", "desktop"],
  "scenarios": [
    {
      "id": "order-creation-001",
      "description": "BARISTA creates order with valid items",
      "capability": "Order Creation",
      "policyId": "ORD-001",
      "given": {
        "entities": [
          { "type": "cafe", "ref": "cafe-1", "attributes": { "name": "Sonic 01", "active": true } },
          { "type": "product", "ref": "prod-cap", "attributes": { "name": "Cappuccino", "price": 25.0, "active": true, "cafeRef": "cafe-1" } }
        ]
      },
      "when": {
        "actor": "staff-ahmed",
        "action": "createOrder",
        "with": {
          "items": [{ "productRef": "prod-cap", "quantity": 2 }],
          "customer": { "name": "Ahmed", "phone": "01012345678" },
          "sourceType": "INSIDE_CAFE",
          "branchRef": "branch-main"
        }
      },
      "then": {
        "status": "NEW",
        "fields": { "total": 50.0, "itemsCount": 1 },
        "events": [{ "type": "order.created", "source": "domain" }],
        "sideEffects": { "inventory.reserved": true }
      }
    }
  ]
}
```

### 3.2 The only change from the initial v2 design

Remove the **generic $ref system** used in the StateManager. Instead, use **simple string interpolation** in the runner:

```typescript
function resolveRefs(params: any, ctx: Context): any {
  if (typeof params === 'string' && params.startsWith('$ref:')) {
    return ctx.get(params.slice(5));
  }
  if (Array.isArray(params)) return params.map(p => resolveRefs(p, ctx));
  if (params && typeof params === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = resolveRefs(value, ctx);
    }
    return result;
  }
  return params;
}
```

The `ctx` is a `Map<string, any>` — no event emitter, no step accumulator, no query interface.

---

## 4. Runner Lifecycle

### 4.1 Backend

```
Jest lifecycle:
│
beforeAll:
  Create TestingModule (imports: [AppModule])
  │
beforeEach:
  Clear database (truncate test tables)
  Create fresh Context
  │
test.each(scenarios):
  for each scenario:
    │
    setupGiven(module, scenario.given, ctx)
      │  loops over entities, calls service.create() for each
      │  stores entity IDs in ctx by ref name
      ▼
    execute(module, scenario.when, ctx)
      │  switch(action) → service.method(params)
      ▼
    assertThen(result, scenario.then, ctx)
      │  Jest expect() for status, fields, events, side effects
      ▼
    (implicit pass/fail)
  │
afterEach:
  Close database transaction (rollback)
  │
afterAll:
  Close TestingModule
```

### 4.2 Desktop

```
Rust lifecycle:
│
#[test] fn run_*():
  │
  Create in-memory SQLite database
  Initialize services with DB handle
  │
  for each scenario:
    │
    ctx.reset()
    setup_given(scenario.given, &mut ctx)
    │
    let result = execute(scenario.when, &ctx)
    │
    assert_then(result, scenario.then, &ctx)
    │  assert_eq! / assert! for status, fields, events, side effects
    │  on failure: panic! with diff message
  │
  Drop database
```

---

## 5. File Layout

```
sonex-specs/
├── README.md
├── policies/
│   ├── catalog.md
│   └── p0.6-resolution.md
├── scenarios/
│   ├── costing.json                    (v1 — backward compatible)
│   └── orders/                         (v2 — new format)
│       ├── order-creation.json
│       ├── order-status-machine.json
│       ├── order-cancellation.json
│       ├── order-in-cafe.json
│       ├── order-payment.json
│       ├── order-modification.json
│       ├── order-refund.json
│       └── order-offline.json
└── runners/
    ├── README.md
    └── backend/
        └── order-lifecycle.runner.spec.ts
    └── desktop/
        └── order_lifecycle.rs
```

No `engine/` directory. No abstract types. No adapter traits. No registry.

---

## 6. Costing Scenario Compatibility

The existing 13 costing scenarios use the v1 format (`function`, `input`, `expectedOutput`).

**Solution**: Keep them as-is. The v2 runner checks `scenario.version`:

```typescript
if (scenario.version === 1) {
  // Legacy path: build implicit given/then from input/expectedOutput
  const result = execute(module, { action: scenario.function, with: scenario.input }, ctx);
  assertThen(result, { fields: scenario.expectedOutput, tolerance: scenario.tolerance }, ctx);
} else {
  // v2 path
  setupGiven(module, scenario.given, ctx);
  const result = execute(module, scenario.when, ctx);
  assertThen(result, scenario.then, ctx);
}
```

Costing scenarios remain untouched. No format migration needed.

---

## 7. Migration Plan

```
Step 1 ── Create Backend runner for order scenarios
│
├── Write order-lifecycle.runner.spec.ts
├── Implement execute() switch with order capabilities
├── Implement setupGiven() for cafe/product/staff/branch entities
├── Implement assertThen() for fields/events/sideEffects
├── Run: 109 order scenarios
└── Verify: all pass
│
Step 2 ── Create Desktop runner for order scenarios
│
├── Write order_lifecycle.rs test module
├── Implement execute() match with order capabilities
├── Implement setup_given() for entities
├── Implement assert_then() 
├── Run: 109 order scenarios
└── Verify: all pass
│
Step 3 ── CI integration
│
├── Add to CI: both runners execute on PR
├── Gate on: all targeted scenarios pass
└── Verify: no regressions
│
Step 4 ── Future domains (P2, P3)
│
For each new domain:
├── Write JSON scenarios
├── Add cases to execute() switch in both runners
├── Add entity types to setupGiven()
└── Run
```

---

## 8. Complexity Comparison

| Aspect | Behaviour Engine (v1) | Behaviour Runner V1 (v2) |
|--------|----------------------|--------------------------|
| Engine abstractions | 7 components | 0 |
| Adapter interfaces | 2 (TypeScript + Rust) | 0 |
| Capability Registry | 1 | 0 |
| State Manager | 1 | `Map<string, any>` — 3 lines |
| HTTP test endpoints | 2 | 0 |
| New files | ~12 | ~4 |
| New LOC (Backend) | ~1,350 | ~300 |
| New LOC (Desktop) | ~1,450 | ~400 |
| Generic orchestration | Yes | No |
| Testing dependency | Test harness + WebSocket | NestJS TestingModule only |

**Result: 80% less code, zero new frameworks, zero new endpoints.**

---

## 9. Risks

| Risk | Probability | Impact | Mitigation |
|------|-----------|--------|------------|
| execute() switch grows large | Medium | Low | Group by domain file — each runner file handles ~15 actions max |
| Database state leaks between scenarios | Low | Medium | beforeEach: truncate + recreate via TestingModule |
| Desktop/Rust behaviour diverges from Backend | Medium | High | Same JSON specs, same entity setup, same assertions — diff on CI |
| v1 costing scenarios need maintenance | Low | Low | Keep v1 compatibility path; no migration needed |
| Context ref resolution too simple for complex chains | Medium | Low | Start simple, add `$.steps[N].result` only when proven necessary |

---

## 10. Recommendation

### ✅ APPROVED

**Build Behaviour Runner V1.** It is the minimum viable execution layer for the 109 order lifecycle scenarios.

- One switch statement per runner (`execute()`)
- One entity creation loop per runner (`setupGiven()`)
- One assertion function per runner (`assertThen()`)
- Context is a `Map<string, any>`
- No new frameworks, no test endpoints, no generic engine
- Costing v1 scenarios work unchanged via compatibility shim

**Estimated effort:** ~300 LOC (Backend) + ~400 LOC (Desktop). Can be built and verified in one session.

If the switch statement exceeds 30 cases or multi-step chaining becomes painful, THEN we invest in a more sophisticated engine. Not before.

---

*End of Behaviour Runner V1 Architecture v2.0*
