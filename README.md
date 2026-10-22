# Pickup Counter

A robust, concurrency-safe counter collection service and customer web application for MetroSober artisanal goods. Built with NestJS, PostgreSQL 16 (plain SQL with `pg`), React 19, Vite, and TypeScript across all packages.

---

## 1. How to Run

### Option A: Local Development (Quickstart)

Ensure PostgreSQL 16 is running on `localhost:5432`.

```bash
# 1. Install dependencies across all workspaces
npm install

# 2. Run migrations and seed initial products
npm run migrate
npm run seed

# 3. Start backend and frontend concurrently
npm run dev:backend    # Runs NestJS API on http://localhost:3000
npm run dev:frontend   # Runs React + Vite Web UI on http://localhost:5173
```

Visit **http://localhost:5173** to use the customer ordering interface.

### Option B: Docker Compose (Whole Application)

```bash
docker compose up --build
```

- **Web UI**: http://localhost:5173
- **API**: http://localhost:3000
- **PostgreSQL**: localhost:5432

### Running Tests & Quality Checks

```bash
# 1. Run all 78 unit, integration, and concurrency tests (0 mocks, real PostgreSQL):
npm test

# 2. Run ESLint code quality checks:
npm run lint
```

Expected test output:
```
PASS src/test/countdown.spec.ts
PASS src/test/integration.spec.ts
PASS src/common/unit.spec.ts

Test Suites: 3 passed, 3 total
Tests:       78 passed, 78 total
Snapshots:   0 total
Time:        20.61 s
```

### Sending Signed Webhooks (CLI)

Use the built-in CLI helper to trigger HMAC-SHA256 signed payment events:

```bash
# 1. Valid payment for an order
npm run send-webhook -- --orderId <UUID> --amount <PAISE>

# 2. Amount mismatch (triggers needs_review)
npm run send-webhook -- --orderId <UUID> --amount 1000

# 3. Deliberately invalid signature (triggers 401)
npm run send-webhook -- --orderId <UUID> --amount <PAISE> --bad-sig

# 4. Duplicate event replay
npm run send-webhook -- --orderId <UUID> --amount <PAISE> --eventId evt_fixed_id
```

---

## 2. Architecture & Order Status Lifecycle

### System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │          React 19 Frontend (Vite)            │
                  │   - Fraunces & Inter typography              │
                  │   - performance.now() monotonic countdown   │
                  │   - Interactive in-browser payment simulator │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NestJS Backend Service                          │
│                                                                        │
│   Controllers (HTTP) ──> Services (Rules) ──> Repositories (Raw SQL)   │
│   - rawBody: true for byte-level HMAC-SHA256 signature verification     │
│   - Expire-on-read + 5s background sweeper                             │
│   - Structured Logger & Global Exception Filter                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ pg (Pool >= 10)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL 16 Database                             │
│   - products (stock >= 0 constraint)                                   │
│   - orders (UUID PK, state machine status, expires_at)                 │
│   - order_items (composite PK, cascade)                               │
│   - payment_events (event_id PK for database-level idempotency)        │
└────────────────────────────────────────────────────────────────────────┘
```

### Order Status State Machine

```
pending ────── valid payment in time ─────────► paid ────── pickup ──────► picked_up
   │
   ├────── customer cancels hold ─────────────► cancelled (stock restored immediately)
   │                                               │
   │                                               └─ payment in-flight ─► needs_review (payment_after_cancel, refund_flag=true)
   │
   ├────── 120s pass without payment ─────────► expired
   ├────── wrong payment amount ──────────────► needs_review (amount_mismatch)
   ├────── late payment, stock gone ──────────► needs_review (late_payment_stock_gone, refund_flag=true)
   └────── late payment, stock still free ────► paid (outcome: paid_late)

expired (after sweeper or read)
   ├────── late payment, stock still free ────► paid (outcome: paid_late)
   ├────── late payment, stock gone ──────────► needs_review (late_payment_stock_gone, refund_flag=true)
   └────── wrong payment amount ──────────────► needs_review (amount_mismatch)
```

- **Allowed moves only:** Transitions are enforced conditionally (`WHERE status = ...`).
- **Terminal states:** `picked_up`, `cancelled`, and `needs_review` are immutable and never transition further without human staff intervention.

---

## 3. Code Organization & Shared Libraries

- `shared/`: Shared across backend and frontend. Contains canonical TypeScript types (`Product`, `Order`, `OrderStatus`, `WebhookPayload`), domain constants (`HOLD_SECONDS = 120`), and money arithmetic helpers (`toPaise`, `formatRupees`, `paiseToRupees`).
- `backend/src/common/`: Shared internally within the backend service (database connection pool, `withTransaction`, HMAC cryptographic verification, time arithmetic, `AppError`, and `AllExceptionsFilter`).
- `backend/src/modules/`: Modular domain design:
  - `inventory`: Stock reservation query (`getHeldUnits`) and permanent decrement (`decrementStock`).
  - `products`: Product catalog listing and availability calculation.
  - `orders`: Transactional order placement with dead-lock-free row locks (`FOR UPDATE ORDER BY id`).
  - `payments`: Webhook verification, database idempotency, and outcome resolution.
  - `pickup`: Atomic single-claim locker verification.
  - `jobs`: Background `@Interval(5000)` order expiry sweeper.
  - `health`: Database connectivity health check.

---

## 4. Definition of "Available Units"

**Rule:** `availableUnits = stock - heldUnits`, clamped to a minimum of 0.

**What counts as held units?**
1. Unexpired pending orders (`status = 'pending' AND expires_at > clock_timestamp()`).
2. Paid orders not yet collected (`status = 'paid'`).

**Why paid orders must hold stock:**
The prompt specifies that inventory is physically deducted only upon locker pickup (`claimPickup`). If paid orders were not counted as holding stock, another customer could buy those units between the time customer A paid and customer A walked to the counter locker. When customer A attempted pickup, the counter would be short, violating the non-negotiable rule that stock is never sold twice.

---

## 5. Decisions Table & Late-Payment Trade-off

| Question | Decision | Reason |
|---|---|---|
| **Money representation** | Integer paise only | Prevents IEEE 754 floating-point rounding errors. Rupee conversion happens exclusively for display strings. |
| **Pricing authority** | Server reads prices from database | Client cannot tamper with line prices or order totals. |
| **Held stock definition** | Unexpired pending orders + paid orders not yet picked up | Prevents double-selling units before customer reaches the pickup locker. |
| **Stock deduction timing** | Exclusively at successful locker claim | Matches brief specification while maintaining safety via held units. |
| **Concurrency control** | `SELECT ... FOR UPDATE ORDER BY id` inside transactions | Eliminates overselling and eliminates deadlocks through canonical ascending lock order. |
| **Hold expiry** | Expire-on-read in SQL queries + 5-second background sweeper | Guarantees correctness on every request even if background cron is delayed. |
| **Clock reference** | Database clock (`clock_timestamp()`) | Counter device clocks may drift or be intentionally desynchronized. |
| **Idempotency** | `payment_events.event_id` PRIMARY KEY | Enforced by PostgreSQL constraint; atomic duplicate detection via `ON CONFLICT DO NOTHING RETURNING`. |
| **Late payment** | If stock is still available: accept as `paid` (outcome `paid_late`). If stock is depleted: `needs_review` with `refund_flag = true`. | Respects customer payment when fair without ever overselling inventory. |
| **Amount mismatch** | `needs_review`, hold released | Never mark order as paid on mismatched amount. |
| **Unknown order in webhook** | Record event, return 200 `{ outcome: 'ignored' }`, do nothing | Prevents external payment webhook providers from retrying indefinitely. |
| **Webhook key casing** | Accepts both `eventId`/`orderId`/`amountPaise` and `event_id`/`order_id`/`amount_paise` | Robust against differences in webhook provider serialization styles. |
| **Database layer** | Plain SQL with `pg`, no ORM | Transparent queries, exact locking mechanics, zero ORM abstraction overhead. |

### Late Payment Trade-off Analysis
- **Decision:** When a valid payment arrives after the 120s hold expires:
  1. We check if all items in the order still have unreserved stock available.
  2. If stock exists: we transition the order to `paid` (`paid_late`) and re-reserve the units.
  3. If any line has been bought by another shopper: we mark `needs_review`, record `review_reason = 'late_payment_stock_gone'`, and set `refund_flag = true`.
- **Trade-off:**
  - *Alternative A (Reject all late payments immediately):* Simple, but punishes customers whose payments were delayed by bank processing lags (121 seconds instead of 120 seconds).
  - *Alternative B (Accept all late payments blindly):* Risks catastrophic overselling if another customer claimed the stock.
  - *Chosen Approach:* Balances customer fairness and inventory integrity. The customer gets their goods if the shelf has stock; otherwise, an audit flag is raised for refund without ever causing an inventory shortage.

---

## 6. Assumptions

1. **Webhook Security:** Webhooks originate over TLS/HTTPS with the shared secret `WEBHOOK_SECRET` pre-shared between the provider and counter.
2. **Order Expiration Window:** 120 seconds (`HOLD_SECONDS`) provides sufficient time for QR-code scanning or simulated card authorization while freeing locked stock for other customers if abandoned.
3. **Locker Hardware Interface:** The physical locker calls `POST /orders/:id/pickup-claim` upon PIN/QR entry.

---

## 7. How Correctness Was Checked

78 automated tests execute across 3 test suites against an active PostgreSQL test instance (`pickup_test`), verifying:

1. **R1 Catalog & Stock (A1–A6):** Accurate available units calculation; stock reductions reflected in real time.
2. **R2 Order Placement & Concurrency (B1–B16):** Duplicate product merging, server-side price computation, insufficient stock rollback, 404s, and 400s.
3. **R10 Concurrency Race (B17):** 10 simultaneous orders competing for the last 2 units. Exactly 2 succeed (201), 8 fail with 409 `INSUFFICIENT_STOCK`, available units clamp to 0, and exactly 2 orders exist in the database.
4. **R3 Expiry & Sweeper (C1–C5):** Expire-on-read unlocks units immediately after 120s elapses; sweeper automatically updates status.
5. **R4 Signature Verification (D5–D13):** Rejects missing header, wrong secrets, tampered JSON body, and non-hex inputs with 401 `INVALID_SIGNATURE`.
6. **R5 Webhook Idempotency (D2, D3, D4, D21):** Serial and concurrent delivery of identical `eventId`s. Exactly 1 row inserted, second request returns `{ duplicate: true }`, order state unmodified.
7. **R6 Amount Mismatch & Capture (D1, D14–D17):** Amount differences route to `needs_review` and release stock; non-captured events ignored.
8. **R7 Late Payment (D18–D20):** Payment after expiry succeeds if shelf has stock; routes to `needs_review` with `refund_flag` if stock was taken.
9. **R8 Pickup Claim Concurrency (E1–E11, E9):** Atomic update ensures only one locker claim wins (200), simultaneous claim returns 409 `ALREADY_CLAIMED`, stock decremented exactly once.
10. **Storefront & Concurrency Extensions (X1–X9):**
    - `X1`: `POST /orders/:id/cancel` immediately releases held stock and restores `availableUnits`.
    - `X2`: `POST /orders/:id/cancel` is idempotent on already-cancelled holds.
    - `X3`: Cancellation rejected with 409 `NOT_CANCELLABLE` if already paid or collected.
    - `X4`: `POST /orders` returns 409 with itemized `details.shortages` array for basket reconciliation.
    - `X5`: Line item quantity (max 99) and order lines (max 20) strictly validated.
    - `X6`: Server-generated locker bay (1–24 sequence) and 4-digit pickup code assigned.
    - `X7`: Demo payment endpoint safely transitions order to `paid` using DB-authoritative amount.
    - `X8`: Payment captured after customer cancellation flags `needs_review` with `payment_after_cancel` and `refund_flag=true`.
    - `X9`: `GET /health` reports `demoMode` and `holdSeconds` runtime flags.
11. **Unit Logic (G1–G7):** Table-driven tests for webhook decisions, timing-safe HMAC verification, monotonic clock arithmetic, and currency conversion.
12. **Frontend Robustness (H1–H3):** Device clock shifted 10 minutes ahead has 0% impact on countdown; monotonic timer handles server re-sync without client-side state drift.

---

## 8. What is Unfinished (Honest Assessment)

1. **Automated Refund Execution:** While the system flags `refund_flag = true` and records `review_reason` in PostgreSQL, actual reverse payment disbursement currently requires staff initiation.
2. **Admin Review Dashboard:** Staff currently resolve `needs_review` orders via database queries or backend scripts rather than a dedicated admin UI screen.
3. **Provider IP Allow-Listing:** Webhook authenticity relies entirely on HMAC-SHA256 signatures; production deployments would add CIDR subnet IP filtering.

---

## 9. What I Would Do Next

1. **Idempotency Keys on `POST /orders`:** Prevent duplicate order creation if customer double-clicks "Place Order" under poor cellular connections.
2. **Automated Refund Job:** Worker queue (e.g. BullMQ / Redis) that polls orders with `refund_flag = true` and calls the payment gateway's refund API.
3. **Staff Admin Portal:** Dedicated view to list orders flagged as `needs_review` with manual override buttons (e.g. "Dispense Alternate Item" or "Trigger Refund").
4. **Rate Limiting & DDoS Protection:** IP-based rate limiting on `POST /orders` and `POST /payments/webhook`.
5. **Prometheus Metrics:** Track metrics for hold expiry ratios, payment failure rates, and concurrency conflict frequencies.
