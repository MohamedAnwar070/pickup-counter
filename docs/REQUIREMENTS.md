# Pickup Counter: Requirement Sheet

Single reference for the whole build. Every requirement has an ID (R1 to R13), a list of acceptance criteria and the test IDs that prove it. Use the IDs in commit messages and test names, for example `feat(R2): hold stock inside a transaction` and `it('B17 ...')`.

**Stack:** TypeScript everywhere. NestJS (Node.js), PostgreSQL 16 with `pg` and plain SQL, React + Vite + TypeScript, Jest + Supertest for backend tests, Docker Compose.
**Priority if time runs short:** backend R2 to R8 and their tests first. A plainer screen is fine if the README lists what is missing.

---

## 0. Non-negotiable rules

1. Money is integer paise everywhere. Never floating-point rupees. Convert to rupees only for display.
2. The server reads prices from the database. The client never supplies a price or a total.
3. Use the database clock (`clock_timestamp()`) for every time decision. Never the client clock.
4. Stock never goes negative and is never sold twice.
5. Duplicate webhook events change nothing.
6. Exactly one pickup claim succeeds per order.
7. Every error also proves that nothing changed.
8. `docker compose up` starts the whole app.

---

## 1. Requirements

Status key: `[ ]` not started, `[~]` in progress, `[x]` done and tested.

### R1. Catalog and stock `[ ]`
- Seed about five products: name, price in paise, stock units. The seed runs only when the products table is empty, so a restart never resets stock.
- `GET /products` returns `{ id, name, pricePaise, stock, availableUnits }` for each product.
- `availableUnits = stock - heldUnits`, never below 0.
- Held units = unexpired pending orders plus paid-but-not-picked-up orders.
- **Tests:** A1 to A6

### R2. Place an order and hold stock `[ ]`
- `POST /orders` takes a list of `{ productId, quantity }` and creates an order with `totalPaise`.
- The hold lasts 120 seconds (`HOLD_SECONDS`). Nobody else can buy those units during the hold.
- Not enough stock: 409 `INSUFFICIENT_STOCK`, nothing is held, no order row is left behind. In a multi-item order, one short line means no line is held.
- Same product listed twice is merged into one line.
- Response: `201 { orderId, status, totalPaise, expiresInSeconds }`. `expiresInSeconds` is measured on the server when the response is sent.
- Concurrency: lock product rows (`SELECT ... FOR UPDATE`, sorted by id) inside one transaction.
- **Tests:** B1 to B20, G4, G5

### R3. Expiry `[ ]`
- A hold that ends without payment makes the units available again, and the order shows `expired`.
- Computed on every read from `expires_at`, plus a small background sweeper (`@Interval(5000)`). Expire-on-read is the real guarantee.
- `expiresInSeconds = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))`.
- **Tests:** C1 to C5, G3

### R4. Webhook signature `[ ]`
- `POST /payments/webhook` with body `{ eventId, orderId, amountPaise, status }`.
- Header `X-Signature` is the hex HMAC-SHA256 of the raw request body, with a shared secret from `WEBHOOK_SECRET`.
- Verify on the raw bytes first (`rawBody: true`), compare with `crypto.timingSafeEqual`, then parse JSON.
- Wrong or missing signature: 401, nothing stored, nothing changed.
- Accept `eventId` and `event_id`, and `orderId` and `order_id`, because the brief text is unclear about key style. State it in the README.
- **Tests:** D5 to D13, G2

### R5. Idempotency `[ ]`
- The same `eventId` processed twice changes nothing. Response: `200 { duplicate: true }`.
- The database enforces it: `payment_events.event_id` is the primary key. Insert the event first (`ON CONFLICT DO NOTHING RETURNING`), inside the same transaction as the order update.
- Failure after the insert rolls the whole transaction back, so the provider's retry works.
- **Tests:** D2, D3, D4, D21

### R6. Amount mismatch `[ ]`
- `amountPaise` different from the order total: do not mark paid. Set `needs_review`, reason `amount_mismatch`, release the hold.
- A valid capture with the exact amount, in time, marks the order `paid` and sets `paid_at`.
- Status other than `captured`: outcome `ignored`.
- **Tests:** D1, D14 to D17, G1

### R7. Late payment (my decision) `[ ]`
- A valid payment arrives after the hold expired.
- If every line still has free stock: accept, order becomes `paid` (outcome `paid_late`) and the units are held again.
- If any line is gone: `needs_review`, reason `late_payment_stock_gone`, `refund_flag = true`. Stock is never oversold.
- Why: the customer really paid, so honour it when possible, and never oversell.
- Trade-off to write in the README: customer fairness versus review workload for staff.
- **Tests:** D18 to D20, G1, G6

### R8. Pickup claim `[ ]`
- `POST /orders/:id/pickup-claim` (called by the locker). Success: `200 { status: 'picked_up' }`.
- Two lockers at the same moment: exactly one 200, the other 409.
- Unpaid, expired or `needs_review` order: 409 `NOT_CLAIMABLE`. Already collected: 409 `ALREADY_CLAIMED`. Unknown id: 404. Invalid UUID: 400.
- A successful claim reduces stock permanently, once, in the same transaction as the status change.
- Mechanism: `UPDATE orders SET status='picked_up' WHERE id=$1 AND status='paid'`. Zero rows updated means someone else won or the order is not claimable.
- **Tests:** E1 to E11

### R9. Customer screen (React) `[ ]`
- Product list: price in rupees (from paise, display only) and available units. Add is disabled at 0.
- Cart with quantity controls, a running total and a Place order button.
- `INSUFFICIENT_STOCK` shows a clear message and refreshes the product list.
- Payment screen: amount, countdown, and polling of `GET /orders/:id` every 1 to 2 seconds until `paid`, `expired` or `needs_review`.
- Countdown survives a wrong device clock: never use `Date.now()` or a server timestamp. Store `expiresInSeconds` and `performance.now()` when received. `remaining = expiresInSeconds - (performance.now() - receivedAt) / 1000`. Re-sync on every poll.
- At 0 the screen does not declare expiry itself. It waits for the server status, because a late payment may still turn the order into `paid`.
- Final messages: `paid` (go to the locker), `expired` (hold ended, try again), `needs_review` (payment received, staff will check, do not pay again).
- Include a Simulate payment helper or show the send-webhook command so a reviewer can complete the flow.
- **Tests:** H1 to H5

### R10. Tests that prove the hard parts `[ ]`
Automated, against a real PostgreSQL database (`pickup_test`), no mocks.
1. **Last two units, ten buyers:** stock 2, 10 simultaneous orders. Exactly 2 succeed, 8 get a clean 409, held units 2, available 0, only 2 orders in the database. (B17)
2. **Same webhook twice:** one `payment_events` row, order paid once, `paid_at` unchanged. (D2, D3)
3. **Two simultaneous pickup claims:** one 200, one 409, stock reduced exactly once. (E9)
- Cover positive and negative cases with prepared inputs (section 9).

### R11. Run and demo `[ ]`
- `docker compose up` starts `db`, `api` and `web`. The api waits for a healthy db, runs migrations, runs the seed only when empty.
- `npm run send-webhook` sends a correctly signed webhook. Flags for: order id, amount, event id, status, and a deliberately bad signature. Document these in the README: correct payment, wrong amount, duplicate event id, bad signature, payment after expiry.
- `.env.example` has `WEBHOOK_SECRET`, `HOLD_SECONDS=120`, `DATABASE_URL`. No secrets committed.
- Keep the database pool at 10 or more (tests use 20) so concurrency tests really overlap.

### R12. README.md `[ ]`
1. How to run the app and the tests (exact commands and the expected output summary).
2. Architecture in a few lines and the status diagram.
3. `shared/` is used by backend and frontend, `backend/src/common` is shared inside the backend.
4. The deliberate reading of "available units": paid-but-unpicked orders also hold stock, with the reason.
5. Decisions table (section 3), with the late-payment choice and its trade-off.
6. Assumptions.
7. How I checked correctness (what each test proves).
8. What is unfinished, listed honestly.
9. What I would do next: idempotency key on `POST /orders`, a real provider integration with IP allow-listing, an automatic refund job, an admin screen for `needs_review`, rate limiting, structured logging and metrics, load testing.

### R13. AI_NOTES.md `[ ]`
- Which AI tools were used and for what.
- One prompt that worked well, quoted.
- At least one real thing the AI got wrong and how it was noticed. Use a genuine example from the real work. Do not invent one.
- Half a page is enough. Keep a running log while building: one line at the moment an AI suggestion turns out wrong.

---

## 2. Quality requirements

| ID | Requirement |
|----|-------------|
| Q1 | TypeScript `strict`, no `any`, ESLint and Prettier, `npm run lint` passes |
| Q2 | Constants in one place, no magic numbers (120, 1000 and so on) |
| Q3 | Zod schemas next to each module, one `ZodValidationPipe`, `ParseUUIDPipe` for `:id` |
| Q4 | Layers: controllers (HTTP only) call services (rules), services call repositories (SQL only) |
| Q5 | Pure domain functions for decisions (webhook outcome, state moves, seconds left, availability) |
| Q6 | One inventory module used by orders, payments and pickup: the stock rules exist once |
| Q7 | Env variables validated at startup, a missing secret stops the server with a clear message |
| Q8 | One error type `AppError`, one global exception filter, one error shape `{ error: { code, message, details } }` |
| Q9 | `GET /health` and graceful shutdown (`enableShutdownHooks`, pool closed in `onModuleDestroy`) |
| Q10 | Structured logging with the Nest `Logger`, order id and event id in webhook logs |
| Q11 | Small commits with clear messages, mention the requirement ID |
| Q12 | Optional: GitHub Actions workflow with a Postgres service that runs the tests |

---

## 3. Decisions (copy into the README)

| Question | Decision | Reason |
|----------|----------|--------|
| Money | Integer paise only | No floating-point errors |
| Price source | Server reads price from the database | Client cannot tamper with totals |
| What counts as held | Unexpired pending orders and paid orders not yet picked up | The brief counts only unpaid orders as holding stock. Paid orders also hold, because stock only drops at pickup. Otherwise another customer could buy the same units before pickup and pickup would fail or stock would go negative |
| When stock is reduced | Only at successful pickup | Matches the brief |
| Concurrency control | Lock product rows (`FOR UPDATE`, sorted by id) inside a transaction | Prevents overselling and deadlocks |
| Expiry | Computed from `expires_at` on every read, plus a background sweeper | Correct even if the sweeper is late |
| Clock | Database clock only | The counter clock may be minutes wrong |
| Idempotency | `event_id` primary key in `payment_events` | The database enforces it |
| Late payment | Free stock: accept as paid. Otherwise `needs_review` with a refund flag | Customer really paid, never oversell |
| Amount mismatch | `needs_review`, hold released | Never mark paid on a wrong amount |
| Unknown order in webhook | Record the event, return 200, do nothing | Stops the provider retrying forever |
| Webhook key names | Accept `eventId`/`event_id` and `orderId`/`order_id` | The brief text is unclear about key style |
| Database access | Plain SQL with `pg`, no ORM | The task is about locks and conditional updates, raw SQL shows exactly what runs |

---

## 4. API contract

| Endpoint | Success | Errors |
|----------|---------|--------|
| `GET /products` | 200 list of `{ id, name, pricePaise, stock, availableUnits }` | |
| `POST /orders` | 201 `{ orderId, status, totalPaise, expiresInSeconds }` | 400 invalid, 404 `PRODUCT_NOT_FOUND`, 409 `INSUFFICIENT_STOCK` |
| `GET /orders/:id` | 200 `{ id, status, totalPaise, expiresInSeconds, reviewReason }` | 400 bad id, 404 |
| `POST /payments/webhook` | 200 `{ outcome }` or `{ duplicate: true }` | 401 bad signature, 400 malformed |
| `POST /orders/:id/pickup-claim` | 200 `{ status: 'picked_up' }` | 400, 404, 409 `ALREADY_CLAIMED`, 409 `NOT_CLAIMABLE` |
| `GET /health` | 200 | |

NestJS note: every POST defaults to 201. Add `@HttpCode(200)` on the webhook and on pickup-claim. `POST /orders` correctly stays 201.

Error shape everywhere: `{ "error": { "code": "...", "message": "...", "details": ... } }`

---

## 5. Data model

```sql
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  stock       INTEGER NOT NULL CHECK (stock >= 0)   -- safety net against negative stock
);

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status            TEXT NOT NULL CHECK (status IN ('pending','paid','expired','needs_review','picked_up')),
  total_paise       INTEGER NOT NULL CHECK (total_paise >= 0),
  expires_at        TIMESTAMPTZ NOT NULL,
  paid_at           TIMESTAMPTZ,
  paid_amount_paise INTEGER,
  review_reason     TEXT,    -- amount_mismatch | late_payment_stock_gone
  refund_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  picked_up_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id         UUID NOT NULL REFERENCES orders(id),
  product_id       INTEGER NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE payment_events (
  event_id     TEXT PRIMARY KEY,               -- unique: duplicates are blocked here
  order_id     UUID,
  amount_paise INTEGER NOT NULL,
  status       TEXT NOT NULL,
  outcome      TEXT,                           -- paid | paid_late | needs_review | ignored
  raw_body     JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status_expiry ON orders (status, expires_at);
CREATE INDEX idx_items_product ON order_items (product_id);
```

---

## 6. Order state machine

```
pending --- valid payment in time -----------> paid --- pickup ---> picked_up
   |
   |-- 120s pass, no payment ----------------> expired
   |-- wrong amount -------------------------> needs_review
   |-- late payment, stock gone -------------> needs_review (refund flag)
   |-- late payment, stock still free -------> paid

expired (after the sweeper has run)
   |-- late payment, stock still free -------> paid
   |-- late payment, stock gone -------------> needs_review (refund flag)
   |-- wrong amount -------------------------> needs_review
```

- Allowed moves only. Every change uses a conditional update (`WHERE status = ...`), so two requests can never both move the same order.
- Nothing leaves `picked_up`. `needs_review` stays until a human acts.
- A late payment usually arrives after the sweeper marked the order `expired`, so `expired` to `paid` and `expired` to `needs_review` must be allowed.

---

## 7. Core logic

### 7.1 Held units
```sql
SELECT oi.product_id, SUM(oi.quantity)::int AS held
FROM order_items oi JOIN orders o ON o.id = oi.order_id
WHERE oi.product_id = ANY($1)
  AND ( (o.status = 'pending' AND o.expires_at > clock_timestamp()) OR o.status = 'paid' )
GROUP BY oi.product_id;
```
`available = stock - held`. The same logic powers `GET /products`.

### 7.2 createOrder
1. Merge duplicate products. Sort product ids ascending (fixed order means no deadlocks).
2. Begin transaction. `SELECT id, price_paise, stock FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE`.
3. Missing product: 404 `PRODUCT_NOT_FOUND`.
4. Compute held units inside the same transaction. Any line with `stock - held < quantity`: 409 `INSUFFICIENT_STOCK` (rollback means nothing held).
5. Total = sum of server price x quantity. Insert order with `expires_at = clock_timestamp() + HOLD_SECONDS`, insert items. Return `expiresInSeconds`.

### 7.3 handleWebhook (steps in order)
1. Verify signature on the raw body. Invalid: 401, stop.
2. Parse and validate JSON with Zod. Invalid: 400.
3. Transaction: `INSERT INTO payment_events ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id`. No row returned means duplicate: commit, respond `200 { duplicate: true }`.
4. `SELECT * FROM orders WHERE id = $1 FOR UPDATE`. Not found: outcome `ignored`, 200.
5. Status not `captured`, or order already `paid`, `picked_up` or `needs_review`: `ignored`, 200.
6. `amountPaise` differs from `total_paise`: `needs_review`, reason `amount_mismatch`.
7. Order pending and hold not expired: `paid`, record `paid_at` and `paid_amount_paise`.
8. Otherwise late payment: lock product rows (sorted), recompute held units, check every line. Enough stock: `paid` (outcome `paid_late`). Not enough: `needs_review`, reason `late_payment_stock_gone`, `refund_flag = true`.
9. Update the event row with the outcome. Commit. Respond 200 with the outcome.

### 7.4 claimPickup
1. `UPDATE orders SET status='picked_up', picked_up_at=now() WHERE id=$1 AND status='paid'`.
2. Zero rows: look up the order. Missing: 404. `picked_up`: 409 `ALREADY_CLAIMED`. Anything else: 409 `NOT_CLAIMABLE`.
3. One row: reduce stock for each item (sorted by product id) in the same transaction. The `CHECK (stock >= 0)` constraint is the last safety net.
4. A paid order already counts as held, so available units stay unchanged at pickup.

### 7.5 Signature helper
```ts
function verifySignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

---

## 8. NestJS rules (read before coding)

- `NestFactory.create(AppModule, { rawBody: true })`, and read `req.rawBody` (`RawBodyRequest<Request>`) in the webhook controller. Tests must build the app the same way.
- `bootstrap.ts` exports `createApp()` (rawBody on) and `configureApp(app)` (global exception filter, shutdown hooks, CORS for the Vite origin). `main.ts` and `tests/helpers/app.ts` both call them, so tests run the real app.
- `DatabaseModule` is global. `DatabaseService` exposes the pool and `withTransaction(fn)`. `InventoryModule` exports `InventoryRepo` and is imported by Orders, Payments and Pickup.
- One `ZodValidationPipe`. Do not mix it with class-validator.
- Controllers stay thin: parse input, call one service method, return the result.
- Jest with `ts-jest` or `@swc/jest`, run with `--runInBand` because every test file shares the `pickup_test` database. Real concurrency comes from `Promise.all` inside a test.

---

## 9. Folder structure

```
pickup-counter/
  docker-compose.yml   .env.example   README.md   AI_NOTES.md
  package.json                         (workspaces: backend, frontend, shared)
  docs/REQUIREMENTS.md                 <- this file
  shared/src/                          code used by BOTH backend and frontend
    types.ts  constants.ts  money.ts
  backend/                             (NestJS)
    src/
      main.ts  bootstrap.ts  app.module.ts
      config/                          env.schema.ts (Zod), config.module.ts
      common/                          helpers used only inside the backend
        errors/    app-error.ts, all-exceptions.filter.ts
        pipes/     zod-validation.pipe.ts
        database/  database.module.ts, database.service.ts, migrate.ts
        crypto/hmac.ts   time/clock.ts
      modules/
        inventory/  products/  orders/  payments/  pickup/  health/  jobs/
    migrations/001_init.sql
    scripts/       send-webhook.ts, seed.ts
    tests/
      helpers/     db.ts, factories.ts, webhook.ts, concurrency.ts, app.ts
      unit/  integration/  concurrency/
  frontend/src/                        (React + Vite + TypeScript)
    api/  hooks/  components/  pages/  tests/
```

Pure domain functions live next to their module: `decideWebhookOutcome`, `canTransition`, `computeAvailable`, `secondsLeft`, `mergeLineItems`, and `toPaise` / `formatRupees` in `shared/money.ts`.

---

## 10. Test matrix

Type key: **P** positive, **N** negative (rejected and nothing changes), **E** edge, **C** concurrency.
Rules: every test is independent (truncate tables in `beforeEach`), uses the real database, asserts the database as well as the HTTP reply, never sleeps for expiry (move the clock with `UPDATE orders SET expires_at = now() - interval '1 second'`, plus one real 2-second run), and concurrency tests are repeated (for example 20 loops).

### A. Products
| ID | Type | Setup and input | Expected |
|----|------|-----------------|----------|
| A1 | P | Base fixture | 200, five products, integer paise, `availableUnits` equals stock |
| A2 | P | Pending order for 2 Chocolate Bars | Chocolate available 3, stock still 5 |
| A3 | P | Same order, then `forceExpire` | Chocolate available 5 again |
| A4 | P | Paid order for 2 Chocolate Bars, not picked up | Available stays 3 |
| A5 | E | Cookies with stock 0 | `availableUnits` is 0 |
| A6 | E | Many orders placed together | `availableUnits` never negative |

### B. Placing orders
| ID | Type | Input | Expected |
|----|------|-------|----------|
| B1 | P | 1 Masala Chips | 201, pending, total 2000, `expiresInSeconds` between 118 and 120 |
| B2 | P | 2 Chocolate Bars + 1 Chips | 201, total 11000, two items with unit prices stored |
| B3 | P | Same product twice (1 + 2 Chips) | 201, merged into one line of 3, total 6000 |
| B4 | E | Quantity equal to exactly the available units | 201, available becomes 0 |
| B5 | P | `GET /orders/:id` a moment later | `expiresInSeconds` smaller than at creation |
| B6 | N | 3 Coffees (2 left) | 409 `INSUFFICIENT_STOCK`, no order row, availability unchanged |
| B7 | N | Two products, one short | 409, the other product is NOT held |
| B8 | N | Sold-out Cookies | 409 `INSUFFICIENT_STOCK` |
| B9 | N | Unknown product id 999 | 404 `PRODUCT_NOT_FOUND`, nothing held |
| B10 | N | Quantity 0 | 400 |
| B11 | N | Quantity -1 | 400 |
| B12 | N | Quantity 1.5 | 400 |
| B13 | N | Empty items list | 400 |
| B14 | N | Missing body, wrong types, product id as text | 400 |
| B15 | N | Quantity 1000000000 | 400 (above maximum) |
| B16 | N | Body includes a fake `totalPaise` or `pricePaise` | Ignored, total comes from the database |
| B17 | C | 10 buyers, 1 unit each, stock 2 | Exactly 2 succeed, 8 get 409, held 2, available 0, 2 orders in DB |
| B18 | C | 10 buyers, 1 unit each, stock 10 | All 10 succeed (no false rejections) |
| B19 | C | Stock 5, simultaneous requests for 3, 2, 1, 1 | Held never exceeds 5, successes total at most 5, each failure is a clean 409 |
| B20 | C | Orders (A then B) and (B then A) at the same time, 20 times | No deadlock, no 500 errors |

### C. Expiry
| ID | Type | Setup | Expected |
|----|------|-------|----------|
| C1 | P | Pending order, `forceExpire`, then `GET /orders/:id` | Status `expired`, `expiresInSeconds` 0 |
| C2 | P | Run the sweeper after `forceExpire` | Order row status is `expired` in the database |
| C3 | P | Expired hold, then another customer buys the same units | 201 for the new buyer |
| C4 | E | Order not yet expired | `expiresInSeconds` never negative |
| C5 | P | Real run with `HOLD_SECONDS=2`, wait 3 seconds | Order expired, units available again |

### D. Payment webhook
| ID | Type | Input | Expected |
|----|------|-------|----------|
| D1 | P | Valid signature, exact amount, in time | 200, order `paid`, `paid_at` set, event outcome `paid` |
| D2 | P | Same event again, one after the other | 200 `duplicate: true`, one event row, order unchanged |
| D3 | C | Same event sent 5 times at once | Processed once, one event row, one paid transition |
| D4 | P | New event id for an already paid order | 200 `ignored`, no change |
| D5 | N | Wrong signature | 401, no event row, order still pending |
| D6 | N | Missing `X-Signature` header | 401 |
| D7 | N | Signature made for a different body (amount tampered after signing) | 401 |
| D8 | N | Signed with the wrong secret | 401 |
| D9 | N | Signature not valid hex or wrong length | 401, no crash |
| D10 | N | Valid signature, malformed JSON | 400 |
| D11 | N | Valid signature, missing `orderId` or `amountPaise` | 400 |
| D12 | N | Amount as text, float (45.5) or negative | 400 |
| D13 | N | `orderId` not a valid UUID | 400 |
| D14 | N | Amount 10999 instead of 11000 | 200, `needs_review`, reason `amount_mismatch`, not paid, hold released |
| D15 | N | Amount higher than total | Same as D14 |
| D16 | N | Status `failed` | 200 `ignored`, order stays pending |
| D17 | N | Unknown order id | 200 `ignored`, event stored, nothing changes |
| D18 | P | Late payment, stock still free (after `forceExpire`) | Order `paid` (outcome `paid_late`), units held again |
| D19 | N | Late payment, units sold to another customer | `needs_review`, reason `late_payment_stock_gone`, `refund_flag` true, stock never negative |
| D20 | N | Late payment, two-item order where one item is gone | `needs_review`, neither item held |
| D21 | E | Failure injected after the event insert (dependency injection) | Whole transaction rolls back, no event row, a retry succeeds |

### E. Pickup
| ID | Type | Setup | Expected |
|----|------|-------|----------|
| E1 | P | Paid order, 2 Chocolate Bars | 200 `picked_up`, stock 5 becomes 3, available unchanged |
| E2 | P | Paid multi-item order | Every product stock reduced by its quantity |
| E3 | N | Pending (unpaid) order | 409 `NOT_CLAIMABLE`, stock unchanged |
| E4 | N | Expired order | 409 `NOT_CLAIMABLE` |
| E5 | N | `needs_review` order | 409 `NOT_CLAIMABLE` |
| E6 | N | Unknown order id | 404 |
| E7 | N | Invalid UUID | 400 |
| E8 | N | Claim the same order twice, one after the other | Second is 409 `ALREADY_CLAIMED`, stock reduced once only |
| E9 | C | Two simultaneous claims on one paid order | One 200, one 409, stock reduced once |
| E10 | C | Ten simultaneous claims on one paid order | One 200, nine 409 |
| E11 | C | Two different paid orders for the same product claimed together | Both succeed (no false conflict), stock reduced by the sum |

### F. Whole journeys
| ID | Journey | Expected |
|----|---------|----------|
| F1 | Happy path: list, order, signed webhook, poll shows paid, claim | Final stock reduced, status `picked_up` |
| F2 | Expiry path: order, no payment, expire, poll | `expired`, units available again, claim returns 409 |
| F3 | Review path: order, wrong amount, poll, claim | `needs_review`, claim returns 409 |
| F4 | Last-unit contention: two customers, one unit, first pays, second tries | Second order rejected at creation, first paid and claimed |

### G. Unit tests (no database, table-driven)
| ID | Target | Cases |
|----|--------|-------|
| G1 | `decideWebhookOutcome` | One row per rule: not captured, already paid, in review, amount mismatch, on time, late with stock, late without stock |
| G2 | `verifySignature` | Correct, wrong secret, tampered body, missing header, non-hex, wrong length |
| G3 | `secondsLeft` | Future, exactly now, past (always 0 or more) |
| G4 | `computeAvailable` | Normal, held above stock (clamped to 0) |
| G5 | `mergeLineItems` | Duplicates merged, order preserved, quantities added |
| G6 | `canTransition` | Every allowed move true (including `expired` to `paid` and `expired` to `needs_review`), every other move false |
| G7 | money helpers | Whole paise only, rupee display without floating-point drift |

### H. Frontend (Vitest and Testing Library, fake timers)
| ID | Case | Expected |
|----|------|----------|
| H1 | Device clock set 10 minutes ahead or behind | Countdown shows the same remaining time |
| H2 | A poll returns a smaller `expiresInSeconds` | Countdown re-syncs to the server value |
| H3 | Countdown reaches 0 | Screen waits for the server status before showing expired |
| H4 | Poll returns `paid`, `expired`, `needs_review` | Correct message for each, polling stops |
| H5 | `INSUFFICIENT_STOCK` on place order | Clear message, product list refreshed |

### Test data
| id | Name | Price (paise) | Stock | Purpose |
|----|------|---------------|-------|---------|
| 1 | Masala Chips | 2000 | 10 | General buying |
| 2 | Chocolate Bar | 4500 | 5 | Matches the 4500 example in the brief |
| 3 | Cold Coffee | 6000 | 2 | Last-units race |
| 4 | Cookies | 3500 | 0 | Sold out |
| 5 | Water Bottle | 2500 | 20 | Large quantities |

Test environment: `WEBHOOK_SECRET=test_secret`, `HOLD_SECONDS=120`, database `pickup_test`.

```ts
// valid order, total = 2*4500 + 1*2000 = 11000
{ items: [{ productId: 2, quantity: 2 }, { productId: 1, quantity: 1 }] }
// valid webhook for that order
{ eventId: 'evt_001', orderId, amountPaise: 11000, status: 'captured' }
// wrong amount, unknown order, failed status
{ eventId: 'evt_002', orderId, amountPaise: 10999, status: 'captured' }
{ eventId: 'evt_003', orderId: '00000000-0000-0000-0000-000000000000', amountPaise: 11000, status: 'captured' }
{ eventId: 'evt_004', orderId, amountPaise: 11000, status: 'failed' }
```

---

## 11. Traceability: requirement to code to tests

| Requirement | Where implemented | Tests |
|-------------|-------------------|-------|
| `GET /products` with available units | `products.service`, `inventory.repo` | A1 to A6 |
| Order with total, 120-second hold | `orders.service`, `findShortages` | B1 to B5 |
| Not enough stock holds nothing | Transaction rollback | B6 to B9 |
| `expiresInSeconds` measured on the server | `secondsLeft`, database clock | B1, B5, C1, C4 |
| Expired holds release units and show `expired` | Read-time rule and sweeper | C1 to C5 |
| Signature on the raw body | `hmac.ts`, `rawBody: true`, webhook controller | D5 to D9, G2 |
| Duplicate events change nothing | `payment_events` primary key | D2, D3 |
| Wrong amount becomes `needs_review` | `decideWebhookOutcome` | D14, D15, G1 |
| Valid capture marks paid | `payments.service` | D1, F1 |
| Late payment decision documented | Domain function and README | D18 to D20 |
| One pickup wins, others get 409 | Conditional `UPDATE` | E8 to E11 |
| Unpaid or expired order cannot be claimed | `claimPickup` | E3 to E5 |
| Claim reduces stock permanently | `inventory.repo.decrementStock` | E1, E2, F1 |
| Countdown correct with a wrong clock | `useCountdown` | H1 to H3 |

---

## 12. Build order and priorities

1. NestJS skeleton (`rawBody`, exception filter, `DatabaseService`), Docker, schema, seed.
2. R1, R2, R3 and the B17 concurrency test.
3. R4 to R7, the `send-webhook` script, D2, D3.
4. R8 and E9.
5. React screen and the countdown (R9).
6. Fresh-clone test, README, AI_NOTES, push to a public repo.

**Protected tests (never cut):** B17 to B20, D2, D3, D5, D14, D18, D19, E3 to E5, E9 to E11.
**Optional if time runs out:** structured logging with `nestjs-pino`, GitHub Actions, the `shared/` workspace package (copy the types file and say so in the README), frontend tests H2 to H5. Anything cut goes under "What is unfinished" in the README.

---

## 13. Definition of done

- [ ] Repo is public and the link opens in a private browser window
- [ ] `docker compose up` works from a fresh clone with no extra steps
- [ ] Seed data loads and `GET /products` returns about five products
- [ ] Seed runs only when the products table is empty (a restart keeps stock)
- [ ] Money is integer paise everywhere
- [ ] Signature uses the raw body and `timingSafeEqual`
- [ ] `rawBody: true` is set in both `main.ts` and the test app, and webhook and pickup-claim return 200
- [ ] All three required tests (R10) pass against real Postgres
- [ ] `npm run send-webhook` works and is documented
- [ ] Countdown uses only the server value
- [ ] README includes the late-payment decision, assumptions, how it was checked, and next steps
- [ ] `AI_NOTES.md` is honest and includes one real AI mistake
- [ ] No secrets committed (only `.env.example`)
- [ ] `npm run lint` passes
