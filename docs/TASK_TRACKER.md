# Pickup Counter — Task Tracker

> Derived from [REQUIREMENTS.md](./REQUIREMENTS.md). Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Project Scaffolding & Infrastructure

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T0.1 | Infrastructure | Create `docker-compose.yml` (db, api, web services) | `[ ]` |
| T0.2 | Infrastructure | Create `.env.example` with `WEBHOOK_SECRET`, `HOLD_SECONDS=120`, `DATABASE_URL` | `[ ]` |
| T0.3 | Infrastructure | Create root `package.json` with workspaces (`backend`, `frontend`, `shared`) | `[ ]` |
| T0.4 | Infrastructure | Create `shared/src/types.ts` — shared TypeScript types | `[ ]` |
| T0.5 | Infrastructure | Create `shared/src/constants.ts` — `HOLD_SECONDS`, shared constants | `[ ]` |
| T0.6 | Infrastructure | Create `shared/src/money.ts` — `toPaise`, `formatRupees` helpers | `[ ]` |

---

## Phase 1 — Backend Skeleton (NestJS)

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T1.1 | Backend / Bootstrap | Init NestJS project in `backend/` | `[ ]` |
| T1.2 | Backend / Bootstrap | Create `bootstrap.ts` — `createApp()` with `rawBody: true` and `configureApp()` | `[ ]` |
| T1.3 | Backend / Bootstrap | Create `main.ts` — calls `createApp` + `configureApp` + listen | `[ ]` |
| T1.4 | Backend / Bootstrap | Create `app.module.ts` — root module importing all feature modules | `[ ]` |
| T1.5 | Backend / Config | Create `config/env.schema.ts` — Zod schema for env validation | `[ ]` |
| T1.6 | Backend / Config | Create `config/config.module.ts` — validates env at startup, crash on missing secrets | `[ ]` |
| T1.7 | Backend / Errors | Create `common/errors/app-error.ts` — single `AppError` class | `[ ]` |
| T1.8 | Backend / Errors | Create `common/errors/all-exceptions.filter.ts` — global filter, `{ error: { code, message, details } }` | `[ ]` |
| T1.9 | Backend / Pipes | Create `common/pipes/zod-validation.pipe.ts` — single ZodValidationPipe | `[ ]` |
| T1.10 | Backend / Database | Create `common/database/database.module.ts` — global DatabaseModule | `[ ]` |
| T1.11 | Backend / Database | Create `common/database/database.service.ts` — pool + `withTransaction(fn)` | `[ ]` |
| T1.12 | Backend / Database | Create `common/database/migrate.ts` — migration runner | `[ ]` |
| T1.13 | Backend / Database | Create `migrations/001_init.sql` — full schema (products, orders, order_items, payment_events, indexes) | `[ ]` |
| T1.14 | Backend / Crypto | Create `common/crypto/hmac.ts` — `verifySignature()` with `timingSafeEqual` | `[ ]` |
| T1.15 | Backend / Time | Create `common/time/clock.ts` — `secondsLeft()` helper | `[ ]` |

---

## Phase 2 — R1: Catalog & Stock

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T2.1 | Inventory | Create `modules/inventory/inventory.module.ts` — exports `InventoryRepo` | `[ ]` |
| T2.2 | Inventory | Create `modules/inventory/inventory.repo.ts` — `getHeldUnits()`, `decrementStock()` SQL | `[ ]` |
| T2.3 | Inventory | Implement `computeAvailable()` pure function — `stock - heldUnits`, clamp to 0 | `[ ]` |
| T2.4 | Products | Create `modules/products/products.module.ts` | `[ ]` |
| T2.5 | Products | Create `modules/products/products.controller.ts` — `GET /products` | `[ ]` |
| T2.6 | Products | Create `modules/products/products.service.ts` — list products with `availableUnits` | `[ ]` |
| T2.7 | Products | Create `modules/products/products.repo.ts` — `findAll()` SQL | `[ ]` |
| T2.8 | Seed | Create `scripts/seed.ts` — 5 products, skip if products table non-empty | `[ ]` |
| T2.9 | Tests | Write tests A1–A6 (products with availability) | `[ ]` |

---

## Phase 3 — R2: Place Order & Hold Stock

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T3.1 | Orders | Create `modules/orders/orders.module.ts` — imports InventoryModule | `[ ]` |
| T3.2 | Orders | Create `modules/orders/orders.controller.ts` — `POST /orders`, `GET /orders/:id` | `[ ]` |
| T3.3 | Orders | Create `modules/orders/orders.service.ts` — `createOrder()` logic | `[ ]` |
| T3.4 | Orders | Create `modules/orders/orders.repo.ts` — insert order + items SQL, `findById()` | `[ ]` |
| T3.5 | Orders | Create `modules/orders/orders.schema.ts` — Zod schema for create-order body | `[ ]` |
| T3.6 | Orders | Implement `mergeLineItems()` pure function — merge duplicate productIds | `[ ]` |
| T3.7 | Orders | Implement `SELECT ... FOR UPDATE ORDER BY id` in transaction for concurrency safety | `[ ]` |
| T3.8 | Orders | Implement shortage detection — rollback entire order if any line is short | `[ ]` |
| T3.9 | Orders | Return `expiresInSeconds` computed from server clock | `[ ]` |
| T3.10 | Tests | Write tests B1–B16 (order placement positive, negative, edge) | `[ ]` |
| T3.11 | Tests | Write tests B17–B20 (order concurrency — last-unit race, deadlock) | `[ ]` |

---

## Phase 4 — R3: Expiry

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T4.1 | Orders | Implement expire-on-read logic in `GET /orders/:id` and `GET /products` | `[ ]` |
| T4.2 | Orders | Implement `expiresInSeconds` formula using `GREATEST(0, CEIL(...))` | `[ ]` |
| T4.3 | Jobs | Create `modules/jobs/jobs.module.ts` — background sweeper module | `[ ]` |
| T4.4 | Jobs | Create `modules/jobs/expiry-sweeper.service.ts` — `@Interval(5000)` sweeper | `[ ]` |
| T4.5 | Tests | Write tests C1–C5 (expiry behavior, sweeper, rebuy after expiry) | `[ ]` |

---

## Phase 5 — R4: Webhook Signature Verification

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T5.1 | Payments | Create `modules/payments/payments.module.ts` — imports InventoryModule | `[ ]` |
| T5.2 | Payments | Create `modules/payments/payments.controller.ts` — `POST /payments/webhook`, `@HttpCode(200)`, raw body access | `[ ]` |
| T5.3 | Payments | Create `modules/payments/payments.schema.ts` — Zod schema accepting `eventId`/`event_id`, `orderId`/`order_id` | `[ ]` |
| T5.4 | Payments | Implement raw body signature verification in controller (verify before JSON parse) | `[ ]` |
| T5.5 | Tests | Write tests D5–D13 (signature: wrong, missing, tampered, wrong secret, non-hex, malformed JSON) | `[ ]` |

---

## Phase 6 — R5: Idempotency

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T6.1 | Payments | Create `modules/payments/payments.repo.ts` — `insertEvent()` with `ON CONFLICT DO NOTHING RETURNING` | `[ ]` |
| T6.2 | Payments | Implement duplicate detection — no row returned = duplicate, respond `200 { duplicate: true }` | `[ ]` |
| T6.3 | Tests | Write tests D2–D4, D21 (duplicate events, already paid, rollback on failure) | `[ ]` |

---

## Phase 7 — R6: Amount Mismatch

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T7.1 | Payments | Create `modules/payments/payments.service.ts` — `handleWebhook()` orchestrating full flow | `[ ]` |
| T7.2 | Payments | Implement `decideWebhookOutcome()` pure function — all webhook decision rules | `[ ]` |
| T7.3 | Payments | Implement mismatch logic — `needs_review`, reason `amount_mismatch`, release hold | `[ ]` |
| T7.4 | Payments | Implement valid capture — mark `paid`, set `paid_at`, `paid_amount_paise` | `[ ]` |
| T7.5 | Payments | Implement ignored outcomes — non-captured status, already paid/picked_up/needs_review | `[ ]` |
| T7.6 | Tests | Write tests D1, D14–D17 (valid payment, wrong amount, higher amount, failed status, unknown order) | `[ ]` |

---

## Phase 8 — R7: Late Payment

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T8.1 | Payments | Implement late payment with stock available — outcome `paid_late`, re-hold units | `[ ]` |
| T8.2 | Payments | Implement late payment without stock — `needs_review`, `late_payment_stock_gone`, `refund_flag = true` | `[ ]` |
| T8.3 | Payments | Implement `canTransition()` — allow `expired → paid` and `expired → needs_review` | `[ ]` |
| T8.4 | Tests | Write tests D18–D20 (late payment: stock free, stock sold, partial stock gone) | `[ ]` |

---

## Phase 9 — R8: Pickup Claim

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T9.1 | Pickup | Create `modules/pickup/pickup.module.ts` — imports InventoryModule, OrdersModule | `[ ]` |
| T9.2 | Pickup | Create `modules/pickup/pickup.controller.ts` — `POST /orders/:id/pickup-claim`, `@HttpCode(200)` | `[ ]` |
| T9.3 | Pickup | Create `modules/pickup/pickup.service.ts` — `claimPickup()` logic | `[ ]` |
| T9.4 | Pickup | Implement conditional `UPDATE ... WHERE status='paid'` — atomic single-winner claim | `[ ]` |
| T9.5 | Pickup | Implement stock decrement in same transaction — `decrementStock()` sorted by product id | `[ ]` |
| T9.6 | Tests | Write tests E1–E8 (pickup: valid, multi-item, unpaid, expired, needs_review, unknown, invalid UUID, double claim) | `[ ]` |
| T9.7 | Tests | Write tests E9–E11 (pickup concurrency: 2 claims, 10 claims, parallel different orders) | `[ ]` |

---

## Phase 10 — R9: Frontend (React + Vite)

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T10.1 | Frontend / Setup | Init React + Vite + TypeScript project in `frontend/` | `[ ]` |
| T10.2 | Frontend / API | Create `api/` layer — `getProducts()`, `createOrder()`, `getOrder()`, `simulateWebhook()` | `[ ]` |
| T10.3 | Frontend / Products | Build Product List page — prices in rupees (display only), available units, disable at 0 | `[ ]` |
| T10.4 | Frontend / Cart | Build Cart component — quantity controls, running total, Place Order button | `[ ]` |
| T10.5 | Frontend / Cart | Handle `INSUFFICIENT_STOCK` — clear message, auto-refresh product list | `[ ]` |
| T10.6 | Frontend / Hooks | Create `useCountdown` hook — `performance.now()` based, never uses `Date.now()` | `[ ]` |
| T10.7 | Frontend / Payment | Build Payment screen — amount, countdown timer, polling `GET /orders/:id` every 1–2s | `[ ]` |
| T10.8 | Frontend / Payment | Implement poll-based status transitions — stop polling on `paid`, `expired`, `needs_review` | `[ ]` |
| T10.9 | Frontend / Payment | Show final messages — `paid` (go to locker), `expired` (try again), `needs_review` (staff check) | `[ ]` |
| T10.10 | Frontend / Payment | Add Simulate Payment helper / show `send-webhook` command | `[ ]` |
| T10.11 | Frontend / Payment | At countdown 0, wait for server status (do NOT declare expiry client-side) | `[ ]` |

---

## Phase 11 — R10: Required Concurrency Tests

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T11.1 | Tests / Concurrency | B17 — Last two units, ten buyers | `[ ]` |
| T11.2 | Tests / Concurrency | D2/D3 — Same webhook twice (serial + concurrent) | `[ ]` |
| T11.3 | Tests / Concurrency | E9 — Two simultaneous pickup claims | `[ ]` |

---

## Phase 12 — R11: Docker, Scripts & Run Config

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T12.1 | Docker | Create `backend/Dockerfile` | `[ ]` |
| T12.2 | Docker | Create `frontend/Dockerfile` | `[ ]` |
| T12.3 | Docker | Configure Docker Compose — db waits healthy, api runs migrations + seed, web proxies to api | `[ ]` |
| T12.4 | Scripts | Create `scripts/send-webhook.ts` — signed webhook CLI (flags: orderId, amount, eventId, status, bad-sig) | `[ ]` |
| T12.5 | Scripts | Add `npm run send-webhook` to backend package.json | `[ ]` |
| T12.6 | Infrastructure | Ensure database pool ≥ 10 (tests use 20) | `[ ]` |

---

## Phase 13 — Unit Tests (No Database)

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T13.1 | Tests / Unit | G1 — `decideWebhookOutcome` table-driven tests | `[ ]` |
| T13.2 | Tests / Unit | G2 — `verifySignature` (correct, wrong secret, tampered, missing, non-hex, wrong length) | `[ ]` |
| T13.3 | Tests / Unit | G3 — `secondsLeft` (future, now, past) | `[ ]` |
| T13.4 | Tests / Unit | G4 — `computeAvailable` (normal, held above stock clamped to 0) | `[ ]` |
| T13.5 | Tests / Unit | G5 — `mergeLineItems` (duplicates merged, order preserved) | `[ ]` |
| T13.6 | Tests / Unit | G6 — `canTransition` (all allowed + disallowed moves) | `[ ]` |
| T13.7 | Tests / Unit | G7 — money helpers (whole paise, rupee display without float drift) | `[ ]` |

---

## Phase 14 — Frontend Tests

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T14.1 | Tests / Frontend | H1 — Device clock 10 min ahead/behind, countdown unaffected | `[ ]` |
| T14.2 | Tests / Frontend | H2 — Poll returns smaller `expiresInSeconds`, countdown re-syncs | `[ ]` |
| T14.3 | Tests / Frontend | H3 — Countdown reaches 0, screen waits for server status | `[ ]` |
| T14.4 | Tests / Frontend | H4 — Poll returns `paid`/`expired`/`needs_review`, correct final messages | `[ ]` |
| T14.5 | Tests / Frontend | H5 — `INSUFFICIENT_STOCK` shows message, product list refreshed | `[ ]` |

---

## Phase 15 — Integration / Journey Tests

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T15.1 | Tests / Integration | F1 — Happy path: list → order → webhook → poll → claim | `[ ]` |
| T15.2 | Tests / Integration | F2 — Expiry path: order → no payment → expire → poll | `[ ]` |
| T15.3 | Tests / Integration | F3 — Review path: order → wrong amount → poll → claim fails | `[ ]` |
| T15.4 | Tests / Integration | F4 — Last-unit contention: two customers, one unit | `[ ]` |

---

## Phase 16 — Health & Quality

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T16.1 | Health | Create `modules/health/health.module.ts` and `health.controller.ts` — `GET /health` | `[ ]` |
| T16.2 | Quality | Enable TypeScript `strict`, no `any`, ESLint + Prettier | `[ ]` |
| T16.3 | Quality | Ensure `npm run lint` passes across backend and frontend | `[ ]` |
| T16.4 | Quality | Graceful shutdown — `enableShutdownHooks`, pool closed in `onModuleDestroy` | `[ ]` |
| T16.5 | Quality | Structured logging — Nest `Logger`, order id and event id in webhook logs | `[ ]` |

---

## Phase 17 — R12 & R13: Documentation

| Task ID | Feature / Module | Task Name | Status |
|---------|-----------------|-----------|--------|
| T17.1 | Docs | Write `README.md` — how to run, architecture, status diagram | `[ ]` |
| T17.2 | Docs | Write `README.md` — decisions table, late-payment trade-off | `[ ]` |
| T17.3 | Docs | Write `README.md` — assumptions, how correctness was checked | `[ ]` |
| T17.4 | Docs | Write `README.md` — what is unfinished (honestly), what I would do next | `[ ]` |
| T17.5 | Docs | Create `AI_NOTES.md` — tools used, good prompt, one real AI mistake | `[ ]` |

---

## Summary

| Phase | Module | Tasks | Priority |
|-------|--------|-------|----------|
| 0 | Scaffolding & Infra | 6 | 🔴 Critical |
| 1 | Backend Skeleton | 15 | 🔴 Critical |
| 2 | R1 — Catalog & Stock | 9 | 🔴 Critical |
| 3 | R2 — Place Order | 11 | 🔴 Critical |
| 4 | R3 — Expiry | 5 | 🔴 Critical |
| 5 | R4 — Webhook Signature | 5 | 🔴 Critical |
| 6 | R5 — Idempotency | 3 | 🔴 Critical |
| 7 | R6 — Amount Mismatch | 6 | 🔴 Critical |
| 8 | R7 — Late Payment | 4 | 🔴 Critical |
| 9 | R8 — Pickup Claim | 7 | 🔴 Critical |
| 10 | R9 — Frontend | 11 | 🟡 Medium |
| 11 | R10 — Concurrency Tests | 3 | 🔴 Critical |
| 12 | R11 — Docker & Scripts | 6 | 🔴 Critical |
| 13 | Unit Tests (no DB) | 7 | 🟡 Medium |
| 14 | Frontend Tests | 5 | 🟢 Optional |
| 15 | Journey Tests | 4 | 🟡 Medium |
| 16 | Health & Quality | 5 | 🟡 Medium |
| 17 | Documentation | 5 | 🔴 Critical |
| | **Total** | **117** | |

> [!IMPORTANT]
> **If time runs short**: Backend R2–R8 (Phases 3–9) and their tests come first. A plainer frontend is acceptable if the README documents what is missing.
>
> **Protected tests (never cut)**: B17–B20, D2, D3, D5, D14, D18, D19, E3–E5, E9–E11
