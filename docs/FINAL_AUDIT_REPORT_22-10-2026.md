# Final Audit Report — Sonex / Sonic Coffee System

- **Date:** 22-10-2026
- **Active project:** `F:\Sonic-Coffee-System-canonical`
- **Branch:** `develop/canonical-baseline`
- **Scope:** NestJS + PostgreSQL/Prisma + Redis/BullMQ (backend), Next.js (frontend)
- **Verification method:** `tsc --noEmit` + Jest (full unit suite excluding 3 integration specs that require a live DB)

## Classification Legend

`IMPLEMENTED AND VERIFIED` · `IMPLEMENTED BUT NOT VERIFIED` · `PARTIALLY IMPLEMENTED` · `DOCUMENTED ONLY` · `MISSING` · `BLOCKED BY ANOTHER ISSUE`

---

## 1. Executive Summary

| # | Item | Priority | Classification |
|---|------|----------|----------------|
| 1 | Lock down debug endpoints (were `@Public` and leaked secrets) | P0 | IMPLEMENTED AND VERIFIED |
| 2 | Remove Telegram entirely, WhatsApp-only messaging | P0 | IMPLEMENTED AND VERIFIED |
| 3 | Customer login requires OTP | P1 | IMPLEMENTED AND VERIFIED |
| 4 | Boss-Pilot pricing resolved server-side | P1 | IMPLEMENTED AND VERIFIED |
| 5 | `ownerPassword` stored hashed (bcrypt) | P1 | IMPLEMENTED AND VERIFIED |
| 6 | `create_order_transaction` uses server-side quote | P2 | IMPLEMENTED AND VERIFIED |
| 7 | `ai-executive` no longer reports fake success | P2 | IMPLEMENTED AND VERIFIED |
| 8 | `owner-copilot` write policy (proposal-only) | P2 | IMPLEMENTED AND VERIFIED |
| 9 | Reconcile `owner-actions` tests with real policy | P2 | IMPLEMENTED AND VERIFIED |
| 10 | `grounded-ai` upselling bounds | P2 | IMPLEMENTED AND VERIFIED |
| 11 | LLM API key in environment | — | BLOCKED BY ANOTHER ISSUE |
| 12 | OTP stored in-process memory (not distributed) | — | PARTIALLY IMPLEMENTED |
| 13 | Owner proposals/context stored in memory | — | PARTIALLY IMPLEMENTED |
| 14 | Residual `tg_`/`TELEGRAM` branches in order flow | — | DOCUMENTED ONLY |
| 15 | Telegram columns/models in Prisma schema | — | DOCUMENTED ONLY |
| 16 | 3 integration specs (require a live DB) | — | IMPLEMENTED BUT NOT VERIFIED |

---

## 2. P0 — Security / Critical

### 2.1 Debug endpoints — IMPLEMENTED AND VERIFIED
`backend/src/debug/debug.controller.ts`
- Removed all `@Public()` decorators.
- Added `@UseGuards(RolesGuard)` + `@Roles('SUPER_ADMIN')`.
- Added `assertDebugEnabled()`: returns 404 in production unless `DEBUG_ENDPOINTS_ENABLED=true`.
- Stripped secrets from responses (`ownerCode`, `ownerPassword`, `loginCode`, `telegram*`, product `cost`).
- Removed the full-cafe dump fallback in `staff-by-email`.
- `setup-cafe` now returns only `{ id, name, cafeCode }`.
- Documented in `backend/.env.example`.

### 2.2 Telegram removal — IMPLEMENTED AND VERIFIED
- Deleted `backend/src/messaging/telegram/`, `backend/src/telegram-adapter/`, and the dead `backend/src/messaging/` module.
- Removed registrations from `app.module.ts`.
- Rewrote `message-parser.consumer.ts` to WhatsApp-only.
- Cleaned `communication.service.ts`, `deduplication.consumer.ts`.
- `ai-waiter` now sends proactively via `WhatsappService`.
- Frontend references removed.

---

## 3. P1 — Logic / Access Control

### 3.1 Customer OTP login — IMPLEMENTED AND VERIFIED
`backend/src/customer-api/customer-otp.service.ts` (new)
- 6-digit code, 5-minute TTL, 60s resend throttle, max 5 attempts.
- `POST /customer/auth/request-otp` sends via WhatsApp.
- `POST /customer/auth/login` rejects without a valid OTP.
- `devCode` is only returned when `NODE_ENV !== 'production'`.
- Frontend two-step flow in `customer/login/page.tsx`.
- Tests: 19/19.

### 3.2 Boss-Pilot server-side pricing — IMPLEMENTED AND VERIFIED
`backend/src/boss-pilot/boss-integration.service.ts`
- Prices resolved from `prisma.product` by `cafeId`; client `unitPrice` is ignored.
- Unknown product → `Result.fail`.
- DTO `unitPrice` optional, `quantity` `@Min(1)`.
- Tests: 3/3.

### 3.3 Plaintext `ownerPassword` — IMPLEMENTED AND VERIFIED
- Only writer was `debug/setup-cafe`; now uses `bcrypt.hash`.
- Other paths were already hashed.

---

## 4. P2 — Quality / Integrity

### 4.1 `create_order_transaction` — IMPLEMENTED AND VERIFIED
`backend/src/ai/tools/ai-tools.service.ts`
- `recentQuotes` map keyed `${cafeId}:${phone}`, 30-minute TTL.
- `calculate_order_quote` stores the quote; `create_order_transaction` consumes it.
- Cleared after success; friendly error when missing.

### 4.2 `ai-executive` — IMPLEMENTED AND VERIFIED
`backend/src/ai-executive/application/morning-brief.service.ts`
- `approveRecommendation` returns `APPROVED` with an honest message (no fake `EXECUTED`).

### 4.3 `owner-copilot` write policy — IMPLEMENTED AND VERIFIED
`backend/src/owner-copilot/owner-copilot.service.ts`
- Deterministic blocked-response branch, `proposalOnly: true`, audit `WRITE_ACTION_BLOCKED`.
- Never invokes write tools. Tests: 20/20.

### 4.4 `owner-actions` policy tests — IMPLEMENTED AND VERIFIED
`backend/src/owner-actions/owner-action-policy.service.spec.ts`
- Updated stale expectations; expanded executable list to 14 real actions. Tests: 142/142.

### 4.5 `grounded-ai` upselling bounds — IMPLEMENTED AND VERIFIED
`backend/src/ai/grounded-ai-engine.service.ts`
- Added bounded upselling directive; disabled mode forbids suggestions.
- Rewrote `grounded-ai.spec.ts` against the real API. Tests: 14/14.

---

## 5. Remaining Items

### 5.1 LLM API key — BLOCKED BY ANOTHER ISSUE
`backend/.env` has no `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`. Cannot add a secret unilaterally. All AI paths currently run deterministic/fallback. Variable documented and empty in `.env.example`.

### 5.2 In-memory state — PARTIALLY IMPLEMENTED
OTP, `OwnerActionStoreService` proposals, and `OwnerCopilotService` context live in a `Map`. They do not survive restarts and are not shared across instances. Requires Redis/Prisma storage.

### 5.3 Residual `tg_` branches — DOCUMENTED ONLY
`order-flow.service.ts` and `coffee-order.service.ts` still contain `isTelegram` / `TELEGRAM_ORDER` branches that are always `false`. Harmless; intentionally left to avoid risk in the order path.

### 5.4 Prisma Telegram artifacts — DOCUMENTED ONLY
`Telegram*` columns/models and `LearningEvent.channel @default("TELEGRAM")` are intentionally retained to avoid destructive migrations.

### 5.5 Integration specs — IMPLEMENTED BUT NOT VERIFIED
`forecasting-copilot`, `prisma-product-catalog.repository`, and `pipeline` integration specs require a live PostgreSQL and were not run.

---

## 6. Verification

- `tsc --noEmit` → **0 errors**
- Jest (all suites except 3 integration): **119/119 suites, 1650/1650 tests passing**
- Additional fixes for pre-existing failures:
  - `whatsapp.service.spec.ts` — added `PrismaService` mock.
  - `customer-memory.service.spec.ts` — pinned the clock for decay tests.
  - `inventory-pipeline.service.spec.ts` — added `packagingMaterial` mock.
- Note: `worker process failed to exit gracefully` warning is pre-existing (leaked timers), not a failure.

## 7. Recommendations

1. Inject the LLM key via a secure secret manager.
2. Move OTP and owner state to Redis before multi-instance deployment.
3. Run the 3 integration specs against a staging database.
4. Commit the current work (the working tree contains extensive uncommitted changes).
5. Clean up the `tg_` branches in `order-flow` / `coffee-order` in a separate, tested change.
