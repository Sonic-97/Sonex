# Domain Policy Catalog

**Location:** `sonex-specs/policies/catalog.md` (v2.0, 1837 lines, 76k words)

This directory contains the official Business Rule Book for Sonex Coffee OS.

## Contents

| Document | Description |
|---|---|
| `catalog.md` | Complete Domain Policy Catalog covering all 22 domains |
| `catalog-v1.md` | Archived v1.0 (previous phase's extraction) |

## What This Is

- The official business specification for Sonex Coffee OS
- The source of truth for every future implementation
- A document that describes WHAT the system must do, not HOW

## What This Is NOT

- NOT technical documentation
- NOT API documentation
- NOT database documentation

## 22 Domains Documented

Orders, Products, Recipes, Inventory, Pricing, Discounts, Taxes, Payments, Refunds, Debt, Customers, Employees, Drivers, Branches, Suppliers, Expenses, Closing, Loyalty, Notifications, AI Recommendations, Sync, Offline Behaviour

## Hierarchy

```
Domain Policy Catalog (catalog.md)  ← source of truth
    ↓ verifies
Behaviour Scenarios (scenarios/*.json)
    ↓ satisfies
Implementations (backend/, desktop/, sonex-core/)
```

## Versioning

- **Major version bump**: any policy change that invalidates existing scenarios
- **Minor version bump**: adding new policies, updating references
