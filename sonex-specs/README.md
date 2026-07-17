# sonex-specs — Shared Behaviour Specifications

## Hierarchy

```
policies/catalog.md  (Domain Policy Catalog)  ← source of truth
    ↓ verifies
scenarios/*.json     (Behaviour Specifications)
    ↓ satisfies
Implementations      (backend/, desktop/, sonex-core/)
```

## Purpose

Machine-parseable JSON scenarios that define the expected behaviour of duplicated business rules across Backend (TypeScript) and Desktop (Rust).

Both implementations must produce identical results for every scenario.

## Structure

```
sonex-specs/
├── README.md
├── policies/
│   ├── README.md              # Domain Policy Catalog overview
│   ├── catalog.md             # Official business policies (Constitution v1.0)
│   └── p0.6-resolution.md     # Phase P0.6 resolution document
├── scenarios/
│   ├── costing.json           # Recipe costing (computeProductCost, computeCostBreakdown)
│   ├── orders/                # Order lifecycle scenarios (Phase P1)
│   │   ├── order-creation.json
│   │   ├── order-status-machine.json
│   │   ├── order-cancellation.json
│   │   ├── order-in-cafe.json
│   │   ├── order-payment.json
│   │   ├── order-modification.json
│   │   ├── order-refund.json
│   │   └── order-offline.json
│   ├── pricing.json           # Pricing rules (size-based, promotions) [planned]
│   ├── discount.json          # Discount calculation rules [planned]
│   ├── inventory-deduction.json # Inventory deduction rules [planned]
│   ├── payment.json           # Payment calculation rules [planned]
│   └── debt.json              # Debt tracking rules [planned]
└── runners/
    ├── backend.ts             # Reference scenario runner (TypeScript)
    └── desktop.rs             # Reference scenario runner (Rust)
```

## Scenario Format

Each file is a JSON object with:

```json
{
  "version": 1,
  "description": "Human-readable description",
  "targets": ["backend", "desktop"],
  "scenarios": [
    {
      "id": "costing-001",
      "description": "Basic ingredient cost with waste",
      "function": "computeProductCost",
      "input": { ... },
      "expectedOutput": 5.5,
      "type": "number"
    }
  ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|---|
| `id` | string | Unique scenario identifier (kebab-case) |
| `description` | string | Human-readable description |
| `function` | string | Name of the business function under test |
| `targets` | string[] (optional) | Target platforms `["backend"]`, `["desktop"]`, or both. Inherits from top-level if omitted. |
| `input` | object/array | Input data passed to the function |
| `expectedOutput` | number/object/boolean | Expected return value |
| `type` | "number" \| "object" \| "boolean" | Type of expected output |
| `tolerance` | number (optional) | Floating-point tolerance (default 0.0001) |
| `tags` | string[] (optional) | Tags for filtering ("edge-case", "regression", "smoke") |

## Running

### Backend
```bash
cd backend && npx jest --testPathPattern=scenario-runner
```

### Desktop
```bash
cd desktop/src-tauri && cargo test sonex_specs
```

### Both (CI gate)
```bash
cd backend && npx jest --testPathPattern=scenario-runner && cd ../desktop/src-tauri && cargo test sonex_specs
```

## Adding a Scenario

1. Add the JSON object to the appropriate scenario file
2. Verify the function name matches an exported function in both Backend and Desktop
3. Run both runners to confirm identical results
4. Commit the updated JSON file

## Convention

- All monetary values are `f64` (not integers)
- All status names are UPPERCASE strings
- All role names are UPPERCASE strings
- Scenario IDs use the pattern: `{domain}-{NNN}`
