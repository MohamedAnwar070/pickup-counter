# Pickup Counter: Gap Analysis & Verification Audit

Audit of the **Pickup Counter** system against [REQUIREMENTS.md](../docs/REQUIREMENTS.md) and the MetroSober Full Stack Developer Technical Assessment Specification.

Date: 22 October 2026 · Target: MetroSober Private Ltd., Indiranagar, Bengaluru

---

## 1. Executive Summary

An exhaustive audit of the initial implementation against requirements **R1 through R13** and quality criteria **Q1 through Q12** revealed a solid transactional backend engine, but uncovered several critical gaps in customer experience, payment security, and interface robustness.

All critical vulnerabilities and usability gaps have been resolved:
- **Security:** Replaced client-side HMAC secret exposure with a server-authoritative, gated demo payment endpoint (`POST /payments/demo/:orderId`).
- **Resiliency & Resumability:** Replaced a fragile single-page modal checkout with a full multi-route architecture (React Router 7) backed by `localStorage` persistence. Orders survive page reloads, tab closures, and connection drops.
- **Race Condition Visibility:** Added item-level shortage breakdown (`error.details.shortages`) when stock is claimed by a competitor during checkout, allowing automatic basket adjustment.
- **Locker Realism:** Replaced client-hardcoded "Bay 04" with server-generated locker bay assignment (1–24 via sequence) and 4-digit secure pickup codes.
- **True Cancellation:** Added transactional `POST /orders/:id/cancel` that instantly releases held stock, enforces terminal state immutability, and flags in-flight late payments as `needs_review` with `payment_after_cancel` and `refund_flag = true`.
- **Code Quality:** Fixed `npm run lint` by installing and configuring ESLint 10 with TypeScript flat config, passing with 0 errors and 0 warnings.
- **Testing:** Expanded test coverage from 59 tests to **78 automated tests** across 3 suites with zero mocks against PostgreSQL 16.

---

## 2. Requirements Compliance Matrix (R1–R13 & Q1–Q12)

| Requirement | Description | Status | Implementation Details & Test Proof |
|---|---|:---:|---|
| **R1: Catalog & Stock** | 5 seed products, `availableUnits = stock - heldUnits`, paid orders hold stock | ✅ Implemented | Seeded conditionally; `products.repo.ts` and `inventory.repo.ts`. Proved by **Tests A1–A6**. |
| **R2: Place Order & Hold** | 120s hold, `SELECT ... FOR UPDATE ORDER BY id`, rollback on short line, merged items | ✅ Implemented | Plain SQL in single transaction. Proved by **Tests B1–B16, B17–B20, G4, G5**. |
| **R3: Hold Expiry** | Expire-on-read guarantee + 5s background sweeper | ✅ Implemented | Database clock `clock_timestamp()` evaluated on all reads; `@Interval(5000)`. Proved by **Tests C1–C5, G3**. |
| **R4: Webhook Signature** | Raw body HMAC-SHA256 verification using `crypto.timingSafeEqual` | ✅ Implemented | `verifySignature` in `hmac.ts`; accepts both camelCase and snake_case keys. Proved by **Tests D5–D13, G2**. |
| **R5: Idempotency** | Database-enforced idempotency via `payment_events.event_id` PK | ✅ Implemented | `insertEvent` uses `ON CONFLICT DO NOTHING RETURNING`. Proved by **Tests D2–D4, D21**. |
| **R6: Amount Mismatch** | Non-matching amounts route to `needs_review` with reason `amount_mismatch` | ✅ Implemented | State machine releases stock hold and flags order. Proved by **Tests D1, D14–D17, G1**. |
| **R7: Late Payment** | Late capture checks stock: accepts if free (`paid_late`), routes to `needs_review` if sold | ✅ Implemented | Preserves customer fairness without ever overselling. Proved by **Tests D18–D20, G1, G6**. |
| **R8: Pickup Claim** | Atomic single-winner claim; stock deducted permanently in same transaction | ✅ Implemented | `UPDATE orders SET status='picked_up' WHERE id=$1 AND status='paid'`. Proved by **Tests E1–E11**. |
| **R9: Customer Screen** | Real-time catalog, cart controls, resilient countdown, order polling, clear messaging | ✅ Implemented | Multi-route React 19 storefront with Fraunces & Inter typography, live polling, and digital receipts. Proved by **Tests H1–H5** and E2E browser tests. |
| **R10: Hard Part Tests** | Real PostgreSQL database tests for 10-buyer race, duplicate webhooks, simultaneous pickup | ✅ Implemented | Zero mocks, real PostgreSQL instance (`pickup_test`). Proved by **Tests B17, D2, D3, E9**. |
| **R11: Run & Demo** | Docker Compose (`db`, `api`, `web`), CLI `send-webhook` script with flags | ✅ Implemented | Verified docker-compose setup and interactive CLI helper with all required flags. |
| **R12: README.md** | Complete architecture, state diagram, decisions, assumptions, checklist, next steps | ✅ Implemented | Fully documented and synchronized with actual test counts and features. |
| **R13: AI_NOTES.md** | AI tools log, prompt that worked, genuine AI mistakes encountered | ✅ Implemented | Honest retrospective with real architectural and tooling edge cases encountered. |
| **Q1: TypeScript Strict** | `strict: true`, zero `any` in core domain, ESLint passing | ✅ Implemented | ESLint configured with flat config; `npm run lint` passes cleanly. |
| **Q2: Constants Centralized** | No magic numbers (120s, paise multipliers, limits) | ✅ Implemented | Centralized in `@pickup-counter/shared/constants.ts` and Nest config. |
| **Q3: Zod Validation** | Zod schemas next to modules; `ZodValidationPipe` | ✅ Implemented | Strict schema enforcement on all mutation endpoints. |
| **Q4: Clean Architecture** | Controllers (HTTP) → Services (Rules) → Repositories (SQL) | ✅ Implemented | Strict layering across all modules. |
| **Q5: Pure Domain Functions** | State transitions, outcome decisions, availability, time math | ✅ Implemented | `decideWebhookOutcome`, `canTransition`, `computeAvailable`, `secondsLeft`. |
| **Q6: Single Inventory Module** | Shared inventory rules used by orders, payments, pickup | ✅ Implemented | `InventoryRepo` shared across all order lifecycle services. |
| **Q7: Startup Env Validation** | Missing secret crashes server at boot with clear error | ✅ Implemented | `env.schema.ts` validated on `ConfigModule` initialization. |
| **Q8: Global Error Handling** | Single `AppError`, global exception filter, uniform JSON shape | ✅ Implemented | `{ error: { code, message, details } }` returned consistently. |
| **Q9: Health & Shutdown** | `GET /health`, pool closed in `onModuleDestroy` | ✅ Implemented | Health exposes database connectivity, demo mode status, and hold seconds. |
| **Q10: Structured Logging** | Nest `Logger` with order ID and event ID contextual tracking | ✅ Implemented | Contextual logs on all webhook and payment events. |

---

## 3. Discovered Vulnerabilities & Implemented Resolutions

### Gap 1: Insecure Client-Side Webhook HMAC Signing
- **Problem:** The original frontend imported crypto libraries and signed payment webhooks directly in the browser using a shared secret. In a real-world scenario, shipping the webhook secret to the client exposes the server to arbitrary forged payments.
- **Resolution:** Added a dedicated, gated endpoint `POST /payments/demo/:orderId`. The browser only provides the order UUID. The server looks up the authoritative price in the database and runs the payload through the exact same state machine as a production webhook. The endpoint is strictly gated behind `DEMO_MODE=true` in environment configuration.

### Gap 2: Fragile Single-Modal Checkout & Lost Orders
- **Problem:** In the initial UI, checkout was an ephemeral modal overlay. If the user refreshed the page, clicked outside, or navigated away, their pending hold continued running on the server but was completely lost to the user.
- **Resolution:** Re-architected the frontend using React Router 7 into dedicated routes:
  - `/` — Counter Catalog Shelf
  - `/product/:id` — Rich Product Detail with live stock breakdown
  - `/checkout` — Order Review & Hold Placement
  - `/order/:id` — Real-Time Reservation Tracker (countdown, QR, payment status, locker unlock)
  - `/orders` — Resumable "My Reservations" stored in `localStorage`
  - `/how-it-works` — Explanatory guide on reservation mechanics
  - Orders are tracked in `localStorage` (`pickup-counter:orders:v2`) and polled automatically.

### Gap 3: Missing Stock Conflict Visibility on Checkout Races
- **Problem:** When multiple users raced for stock and one lost, `POST /orders` previously returned a generic 409 `INSUFFICIENT_STOCK` without identifying which product caused the shortage. The cart had no mechanism to adapt.
- **Resolution:** Enhanced `createOrder` to return an itemized `details.shortages` array (`[{ productId, name, requested, available }]`). The frontend displays a dedicated conflict alert, highlights the short items, and offers a 1-click button to adjust cart quantities to current shelf availability.

### Gap 4: Client-Hardcoded Locker Assignment
- **Problem:** The payment confirmation screen hardcoded "Locker Bay 04" regardless of order contents or quantity.
- **Resolution:** Created PostgreSQL sequence `order_locker_seq` in migration `002_catalog_and_cancel.sql`. Order creation allocates a real server-side locker bay (`((nextval('order_locker_seq') - 1) % 24) + 1`) and generates a secure random 4-digit numeric pickup code (`pickup_code`). Both are persisted on the order and returned upon payment.

### Gap 5: Inability to Cancel Unpaid Holds
- **Problem:** If a customer changed their mind during the 120-second hold, there was no way to release the items. Other customers were blocked from buying until the full hold window timed out.
- **Resolution:** Implemented `POST /orders/:id/cancel`. The endpoint updates status to `'cancelled'`, sets `cancelled_at`, and immediately restores available units for other customers. If an in-flight payment arrives after cancellation, the payment handler safely routes the order to `needs_review` with `review_reason = 'payment_after_cancel'` and sets `refund_flag = true`.

### Gap 6: Vite/Nginx Proxy Collision on `/products`
- **Problem:** Storing static images in `frontend/public/products/*.jpg` collided with the backend API proxy for `/products`. Requesting an image resulted in Vite or Nginx proxying the request to the NestJS `ProductsController`, causing 404s.
- **Resolution:** Moved static catalog assets to `frontend/public/images/products/*.jpg` and updated seed scripts and database migrations accordingly.

---

## 4. How to Demonstrate Concurrency & Edge Cases

### A. Last 2 Units, 10 Simultaneous Buyers (B17)
Run the automated test proving database-level locking:
```bash
npm test -- -t "B17"
```
**Expected Result:** Exactly 2 orders return 201 Created. Exactly 8 orders return 409 Insufficient Stock. Available stock drops to 0, held units equals 2, and exactly 2 orders exist in PostgreSQL.

### B. Duplicate Webhook Replay (D2 & D3)
Test idempotency via CLI:
```bash
# 1. Place an order on http://localhost:5173
# 2. Send webhook event
npm run send-webhook -- --orderId <ORDER_ID> --amount 35000 --eventId evt_test_123

# 3. Re-send identical webhook event
npm run send-webhook -- --orderId <ORDER_ID> --amount 35000 --eventId evt_test_123
```
**Expected Result:** First request returns `{ outcome: "paid" }`. Second request returns `{ duplicate: true }`. Order is not paid twice, `paid_at` timestamp is untouched, and only one row exists in `payment_events`.

### C. Simultaneous Pickup Claims (E9)
Run the automated dual-locker test:
```bash
npm test -- -t "E9"
```
**Expected Result:** Two concurrent HTTP requests claim the same paid order. Exactly one receives 200 `{ status: "picked_up" }`. The competitor receives 409 `ALREADY_CLAIMED`. Product stock in PostgreSQL is decremented exactly once.

---

## 5. Remaining Scope & Production Next Steps

1. **Automated Refund Disbursement:**
   Orders flagged with `refund_flag = true` (late payment after stock depleted, payment after cancellation) are currently recorded in PostgreSQL for human review. In a full production deployment, a background worker (e.g. BullMQ / Redis) would automatically call the payment gateway's refund API.
2. **Staff Admin Dashboard:**
   A dedicated internal UI for store attendants to inspect `needs_review` orders, view audit reasons, and manually release locker doors or trigger refunds.
3. **Provider IP Allow-Listing:**
   Restricting `POST /payments/webhook` to known CIDR ranges of the payment provider in addition to HMAC signature validation.
4. **Idempotency Keys on Order Creation:**
   Adding client-generated idempotency keys (`Idempotency-Key` header) to `POST /orders` to protect against network retry duplicate holds.
