import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureApp } from '../bootstrap';
import { signPayload } from '../common/crypto/hmac';
import { runMigrations } from '../common/database/migrate';

const TEST_DB_URL = 'postgres://postgres:postgres@localhost:5432/pickup_test';
const TEST_SECRET = 'pickup-test-secret-12345';
const TEST_HOLD_SECONDS = 2; // Fast expiry for testing

process.env.DATABASE_URL = TEST_DB_URL;
process.env.WEBHOOK_SECRET = TEST_SECRET;
process.env.HOLD_SECONDS = String(TEST_HOLD_SECONDS);
process.env.NODE_ENV = 'test';

describe('Pickup Counter Integration & Concurrency Tests', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    await runMigrations(TEST_DB_URL);

    pool = new Pool({
      connectionString: TEST_DB_URL,
      max: 20,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const rawApp = moduleFixture.createNestApplication({ rawBody: true });
    app = configureApp(rawApp);
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  beforeEach(async () => {
    // Reset database to known seed state
    await pool.query('TRUNCATE payment_events, order_items, orders, products RESTART IDENTITY CASCADE');

    await pool.query(`
      INSERT INTO products (id, name, price_paise, stock, category, description, image_url, tagline) VALUES
      (1, 'Artisan Sourdough Loaf', 35000, 10, 'Bakery', 'Naturally fermented 36-hour dough.', '/images/products/sourdough.jpg', 'Baked fresh at 6 AM'),
      (2, 'Cold Brew Concentrate', 42000, 8, 'Cold Brew & Roasts', 'Single-origin cold-water extraction.', '/images/products/coldbrew.jpg', 'Steeped for 20 hours'),
      (3, 'Handmade Ceramic Mug', 65000, 2, 'Studio Ceramics', 'Hand-thrown terracotta mug.', '/images/products/ceramic-mug.jpg', 'Hand-thrown in the studio'),
      (4, 'Organic Mountain Honey', 48000, 12, 'Mountain Pantry', 'Raw wildflower honey.', '/images/products/honey.jpg', '100% raw and wild'),
      (5, 'Espresso Roast Beans', 55000, 15, 'Cold Brew & Roasts', 'Small-batch espresso beans.', '/images/products/coffee-beans.jpg', 'Medium-dark roast')
    `);
  });

  // -------------------------------------------------------------
  // Phase 2: R1 Catalog & Stock (A1 - A6)
  // -------------------------------------------------------------
  describe('R1: Catalog and stock (A1 - A6)', () => {
    it('A1: GET /products returns all products with available units', async () => {
      const res = await request(app.getHttpServer()).get('/products').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(5);
      const mug = res.body.find((p: any) => p.id === 3);
      expect(mug).toBeDefined();
      expect(mug.pricePaise).toBe(65000);
      expect(mug.stock).toBe(2);
      expect(mug.availableUnits).toBe(2);
      expect(mug.category).toBe('Studio Ceramics');
      expect(mug.description).toContain('terracotta');
      expect(mug.imageUrl).toBe('/images/products/ceramic-mug.jpg');
      expect(mug.tagline).toBe('Hand-thrown in the studio');
    });

    it('A2: availableUnits decreases when an order is held', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 1 }] })
        .expect(201);

      const res = await request(app.getHttpServer()).get('/products').expect(200);
      const mug = res.body.find((p: any) => p.id === 3);
      expect(mug.stock).toBe(2);
      expect(mug.availableUnits).toBe(1);
    });

    it('A3: paid order also holds stock until picked up', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 1 }] })
        .expect(201);

      const orderId = orderRes.body.orderId;

      // Pay the order
      const payload = {
        eventId: 'evt_a3_test',
        orderId,
        amountPaise: 65000,
        status: 'captured',
      };
      const rawBody = JSON.stringify(payload);
      const sig = signPayload(rawBody, TEST_SECRET);

      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);

      const productsRes = await request(app.getHttpServer()).get('/products').expect(200);
      const mug = productsRes.body.find((p: any) => p.id === 3);
      expect(mug.availableUnits).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // Phase 3: R2 Place Order & Hold Stock (B1 - B16)
  // -------------------------------------------------------------
  describe('R2: Place order and hold stock (B1 - B16)', () => {
    it('B1: creates order with server-calculated price and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [
            { productId: 1, quantity: 2 },
            { productId: 2, quantity: 1 },
          ],
        })
        .expect(201);

      expect(res.body.orderId).toBeDefined();
      expect(res.body.status).toBe('pending');
      // 2 * 35000 + 1 * 42000 = 70000 + 42000 = 112000
      expect(res.body.totalPaise).toBe(112000);
      expect(res.body.expiresInSeconds).toBeGreaterThan(0);
      expect(res.body.expiresInSeconds).toBeLessThanOrEqual(TEST_HOLD_SECONDS);
    });

    it('B2: merges duplicate line items for the same product', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [
            { productId: 1, quantity: 1 },
            { productId: 1, quantity: 2 },
          ],
        })
        .expect(201);

      expect(res.body.totalPaise).toBe(3 * 35000);
    });

    it('B3: returns 409 INSUFFICIENT_STOCK if requested quantity exceeds stock', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 5 }] })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Verify no order was created in DB
      const dbOrders = await pool.query('SELECT COUNT(*)::int AS count FROM orders');
      expect(dbOrders.rows[0].count).toBe(0);
    });

    it('B4: returns 404 PRODUCT_NOT_FOUND if invalid product ID is given', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 9999, quantity: 1 }] })
        .expect(404);

      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('B5: multi-item order: one short line rolls back entire order', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [
            { productId: 1, quantity: 1 }, // available 10
            { productId: 3, quantity: 10 }, // only 2 available -> conflict!
          ],
        })
        .expect(409);

      // Verify product 1 was NOT held
      const res = await request(app.getHttpServer()).get('/products').expect(200);
      const prod1 = res.body.find((p: any) => p.id === 1);
      expect(prod1.availableUnits).toBe(10);
    });

    it('B6: GET /orders/:id returns order details and line items', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 2 }] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);

      expect(res.body.id).toBe(order.body.orderId);
      expect(res.body.status).toBe('pending');
      expect(res.body.totalPaise).toBe(70000);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].productId).toBe(1);
      expect(res.body.items[0].quantity).toBe(2);
    });

    it('B7: GET /orders/:id returns 400 for non-UUID id', async () => {
      const res = await request(app.getHttpServer()).get('/orders/invalid-uuid-123').expect(400);
      expect(res.body.error.code).toBe('INVALID_UUID');
    });

    it('B8: GET /orders/:id returns 404 for non-existent UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/00000000-0000-0000-0000-000000000000')
        .expect(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('B21: merged duplicate quantities cannot bypass the per-product maximum', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [
            { productId: 1, quantity: 60 },
            { productId: 1, quantity: 60 },
          ],
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('cannot exceed 99');
      const dbOrders = await pool.query('SELECT COUNT(*)::int AS count FROM orders');
      expect(dbOrders.rows[0].count).toBe(0);
    });

    it('B22: race response lists every affected line and holds nothing', async () => {
      // Take the last two mugs, then try to reserve mugs plus more cold brew than exists.
      await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 2 }] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [
            { productId: 3, quantity: 1 },
            { productId: 2, quantity: 9 },
          ],
        })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      const shortages = res.body.error.details.shortages;
      expect(shortages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productId: 3, requested: 1, available: 0 }),
          expect.objectContaining({ productId: 2, requested: 9, available: 8 }),
        ]),
      );

      // Only the first hold exists; the failed request held neither line.
      const dbOrders = await pool.query('SELECT COUNT(*)::int AS count FROM orders');
      expect(dbOrders.rows[0].count).toBe(1);
      const products = await request(app.getHttpServer()).get('/products').expect(200);
      expect(products.body.find((p: any) => p.id === 2).availableUnits).toBe(8);
      expect(products.body.find((p: any) => p.id === 3).availableUnits).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // R9 extensions: cancellable holds, demo checkout, locker details
  // -------------------------------------------------------------
  describe('R9: customer cancellation and resumable orders', () => {
    it('B23: cancelling a pending hold releases stock and is idempotent', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 2 }] })
        .expect(201);

      const productsBefore = await request(app.getHttpServer()).get('/products').expect(200);
      expect(productsBefore.body.find((p: any) => p.id === 3).availableUnits).toBe(0);

      const cancel = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);
      expect(cancel.body).toEqual({ id: order.body.orderId, status: 'cancelled' });

      const productsAfter = await request(app.getHttpServer()).get('/products').expect(200);
      expect(productsAfter.body.find((p: any) => p.id === 3).availableUnits).toBe(2);

      const details = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);
      expect(details.body.status).toBe('cancelled');
      expect(details.body.cancelledAt).toBeTruthy();

      // Retrying cancellation is harmless and does not change the timestamp.
      const retry = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);
      expect(retry.body.status).toBe('cancelled');

      const claim = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/pickup-claim`)
        .expect(409);
      expect(claim.body.error.code).toBe('NOT_CLAIMABLE');
    });

    it('B24: a paid order cannot be cancelled', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/payments/demo/${order.body.orderId}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(409);
      expect(res.body.error.code).toBe('NOT_CANCELLABLE');
      expect(res.body.error.details.status).toBe('paid');
    });

    it('B25: an expired hold cannot be cancelled', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      await pool.query(
        "UPDATE orders SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
        [order.body.orderId],
      );

      const res = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(409);
      expect(res.body.error.code).toBe('NOT_CANCELLABLE');
      expect(res.body.error.details.status).toBe('expired');
    });

    it('D22: demo checkout pays the server total and assigns a stable locker and pickup code', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 2 }] })
        .expect(201);

      const before = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);
      expect(before.body.status).toBe('pending');
      expect(before.body.lockerNumber).toBeGreaterThanOrEqual(1);
      expect(before.body.lockerNumber).toBeLessThanOrEqual(24);
      expect(before.body.pickupCode).toMatch(/^\d{4}$/);

      const payment = await request(app.getHttpServer())
        .post(`/payments/demo/${order.body.orderId}`)
        .expect(200);
      expect(payment.body.outcome).toBe('paid');

      const after = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);
      expect(after.body.status).toBe('paid');
      expect(after.body.paidAt).toBeTruthy();
      expect(after.body.lockerNumber).toBe(before.body.lockerNumber);
      expect(after.body.pickupCode).toBe(before.body.pickupCode);

      // Replaying the demo endpoint is harmless.
      const replay = await request(app.getHttpServer())
        .post(`/payments/demo/${order.body.orderId}`)
        .expect(200);
      expect(replay.body.outcome).toBe('ignored');
    });

    it('D23: a capture after cancellation is reviewable and refund-flagged, even with a wrong amount', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 2, quantity: 1 }] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);

      const payload = {
        eventId: 'evt_after_cancel_wrong_amount',
        orderId: order.body.orderId,
        amountPaise: 1,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(raw, TEST_SECRET))
        .send(payload)
        .expect(200);

      expect(res.body.outcome).toBe('needs_review');
      const details = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);
      expect(details.body.status).toBe('needs_review');
      expect(details.body.reviewReason).toBe('payment_after_cancel');
      expect(details.body.refundFlag).toBe(true);
    });

    it('D24: negative webhook amounts are rejected before they are stored', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_negative',
        orderId: order.body.orderId,
        amountPaise: -1,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(raw, TEST_SECRET))
        .send(payload)
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const events = await pool.query('SELECT COUNT(*)::int AS count FROM payment_events');
      expect(events.rows[0].count).toBe(0);
      const details = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);
      expect(details.body.status).toBe('pending');
    });
  });

  // -------------------------------------------------------------
  // Phase 11: Concurrency Test B17 (Last two units, ten buyers)
  // -------------------------------------------------------------
  describe('R10 / B17: Concurrency — Last two units, ten buyers', () => {
    it('B17: exactly 2 succeed, 8 get 409, available becomes 0, exactly 2 orders created', async () => {
      // Product 3 has stock = 2
      const promises = Array.from({ length: 10 }).map(() =>
        request(app.getHttpServer())
          .post('/orders')
          .send({ items: [{ productId: 3, quantity: 1 }] }),
      );

      const responses = await Promise.all(promises);

      const successCount = responses.filter((r) => r.status === 201).length;
      const conflictCount = responses.filter((r) => r.status === 409).length;

      expect(successCount).toBe(2);
      expect(conflictCount).toBe(8);

      // Verify product 3 availability is now 0
      const prodRes = await request(app.getHttpServer()).get('/products').expect(200);
      const mug = prodRes.body.find((p: any) => p.id === 3);
      expect(mug.stock).toBe(2);
      expect(mug.availableUnits).toBe(0);

      // Verify DB orders count
      const dbOrders = await pool.query('SELECT COUNT(*)::int AS count FROM orders');
      expect(dbOrders.rows[0].count).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // Phase 4: R3 Expiry & Sweeper (C1 - C5)
  // -------------------------------------------------------------
  describe('R3: Expiry (C1 - C5)', () => {
    it('C1: order expires after hold period and releases stock', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 2 }] })
        .expect(201);

      const orderId = orderRes.body.orderId;

      // Available units before expiry is 0
      let prodRes = await request(app.getHttpServer()).get('/products').expect(200);
      expect(prodRes.body.find((p: any) => p.id === 3).availableUnits).toBe(0);

      // Wait for hold to expire (TEST_HOLD_SECONDS = 2s)
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Expire-on-read via GET /orders/:id
      const getRes = await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(200);
      expect(getRes.body.status).toBe('expired');
      expect(getRes.body.expiresInSeconds).toBe(0);

      // Available units restored to 2
      prodRes = await request(app.getHttpServer()).get('/products').expect(200);
      expect(prodRes.body.find((p: any) => p.id === 3).availableUnits).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // Phase 5: R4 Webhook Signature (D5 - D13)
  // -------------------------------------------------------------
  describe('R4: Webhook signature verification (D5 - D13)', () => {
    it('D5: rejects request with missing X-Signature header with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .send({ eventId: 'evt_1', orderId: '00000000-0000-0000-0000-000000000000', amountPaise: 100, status: 'captured' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('D6: rejects request with invalid signature with 401', async () => {
      const payload = { eventId: 'evt_1', orderId: '00000000-0000-0000-0000-000000000000', amountPaise: 100, status: 'captured' };
      const rawBody = JSON.stringify(payload);
      const wrongSig = signPayload(rawBody, 'wrong-secret');

      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', wrongSig)
        .send(payload)
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('D7: rejects tampered body with 401', async () => {
      const originalPayload = { eventId: 'evt_1', orderId: '00000000-0000-0000-0000-000000000000', amountPaise: 100, status: 'captured' };
      const rawBody = JSON.stringify(originalPayload);
      const sig = signPayload(rawBody, TEST_SECRET);

      const tamperedPayload = { ...originalPayload, amountPaise: 5000 };

      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(tamperedPayload)
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('D8: accepts both eventId/orderId and event_id/order_id key styles', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        event_id: 'evt_snake_case_test',
        order_id: order.body.orderId,
        amount_paise: 35000,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const sig = signPayload(raw, TEST_SECRET);

      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);

      expect(res.body.outcome).toBe('paid');
    });
  });

  // -------------------------------------------------------------
  // Phase 6 & 11: R5 Idempotency (D2, D3, D4, D21)
  // -------------------------------------------------------------
  describe('R5: Idempotency (D2, D3, D4, D21)', () => {
    it('D2: same webhook twice in series returns duplicate: true and changes nothing', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_duplicate_serial',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const sig = signPayload(raw, TEST_SECRET);

      // First webhook
      const res1 = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);
      expect(res1.body.outcome).toBe('paid');

      // Second webhook with same eventId
      const res2 = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);
      expect(res2.body.duplicate).toBe(true);

      // Exactly 1 row in payment_events
      const events = await pool.query('SELECT COUNT(*)::int AS count FROM payment_events WHERE event_id = $1', [
        'evt_duplicate_serial',
      ]);
      expect(events.rows[0].count).toBe(1);
    });

    it('D3: concurrent duplicate webhooks: exactly one processes, other returns duplicate: true', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_concurrent_dup',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const sig = signPayload(raw, TEST_SECRET);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).post('/payments/webhook').set('x-signature', sig).send(payload),
        request(app.getHttpServer()).post('/payments/webhook').set('x-signature', sig).send(payload),
      ]);

      const outcomes = [resA.body, resB.body];
      const paidOutcome = outcomes.find((o) => o.outcome === 'paid');
      const dupOutcome = outcomes.find((o) => o.duplicate === true);

      expect(paidOutcome).toBeDefined();
      expect(dupOutcome).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // Phase 7: R6 Amount Mismatch & Capture (D1, D14 - D17)
  // -------------------------------------------------------------
  describe('R6: Amount mismatch (D1, D14 - D17)', () => {
    it('D14: amount mismatch marks order needs_review and releases held units', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_mismatch_test',
        orderId: order.body.orderId,
        amountPaise: 1000, // Total was 65000
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const sig = signPayload(raw, TEST_SECRET);

      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);

      expect(res.body.outcome).toBe('needs_review');

      // Verify order status
      const getRes = await request(app.getHttpServer()).get(`/orders/${order.body.orderId}`).expect(200);
      expect(getRes.body.status).toBe('needs_review');
      expect(getRes.body.reviewReason).toBe('amount_mismatch');

      // Stock is released back into available units
      const prodRes = await request(app.getHttpServer()).get('/products').expect(200);
      const mug = prodRes.body.find((p: any) => p.id === 3);
      expect(mug.availableUnits).toBe(2);
    });

    it('D16: non-captured status is ignored', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_failed_status',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'failed',
      };
      const raw = JSON.stringify(payload);
      const sig = signPayload(raw, TEST_SECRET);

      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);

      expect(res.body.outcome).toBe('ignored');
    });
  });

  // -------------------------------------------------------------
  // Phase 8: R7 Late Payment (D18 - D20)
  // -------------------------------------------------------------
  describe('R7: Late payment (D18 - D20)', () => {
    it('D18: late payment accepted as paid_late when stock is still available', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      // Wait for order to expire
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const payload = {
        eventId: 'evt_late_with_stock',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      const sig = signPayload(raw, TEST_SECRET);

      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', sig)
        .send(payload)
        .expect(200);

      expect(res.body.outcome).toBe('paid_late');

      const getRes = await request(app.getHttpServer()).get(`/orders/${order.body.orderId}`).expect(200);
      expect(getRes.body.status).toBe('paid');
    });

    it('D19: late payment marked needs_review with refund_flag if stock is gone', async () => {
      // Product 3 has stock = 2
      const order1 = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 2 }] })
        .expect(201);

      // Wait for order 1 to expire
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Customer 2 now buys both units of Product 3 and pays
      const order2 = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 2 }] })
        .expect(201);

      const payload2 = {
        eventId: 'evt_cust2_paid',
        orderId: order2.body.orderId,
        amountPaise: 130000,
        status: 'captured',
      };
      const raw2 = JSON.stringify(payload2);
      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(raw2, TEST_SECRET))
        .send(payload2)
        .expect(200);

      // Now late payment arrives for Order 1
      const payload1 = {
        eventId: 'evt_cust1_late_no_stock',
        orderId: order1.body.orderId,
        amountPaise: 130000,
        status: 'captured',
      };
      const raw1 = JSON.stringify(payload1);
      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(raw1, TEST_SECRET))
        .send(payload1)
        .expect(200);

      expect(res.body.outcome).toBe('needs_review');

      const getRes = await request(app.getHttpServer()).get(`/orders/${order1.body.orderId}`).expect(200);
      expect(getRes.body.status).toBe('needs_review');
      expect(getRes.body.reviewReason).toBe('late_payment_stock_gone');
      expect(getRes.body.refundFlag).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // Phase 9 & 11: R8 Pickup Claim & Concurrency (E1 - E11)
  // -------------------------------------------------------------
  describe('R8: Pickup claim (E1 - E11)', () => {
    it('E1: successfully claims a paid order and permanently decrements stock', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 2 }] })
        .expect(201);

      // Pay order
      const payload = {
        eventId: 'evt_pickup_success',
        orderId: order.body.orderId,
        amountPaise: 70000,
        status: 'captured',
      };
      const raw = JSON.stringify(payload);
      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(raw, TEST_SECRET))
        .send(payload)
        .expect(200);

      // Claim pickup
      const claimRes = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/pickup-claim`)
        .expect(200);

      expect(claimRes.body.status).toBe('picked_up');

      // Verify order status
      const getRes = await request(app.getHttpServer()).get(`/orders/${order.body.orderId}`).expect(200);
      expect(getRes.body.status).toBe('picked_up');

      // Verify stock in DB is decremented (10 - 2 = 8)
      const prodRes = await pool.query('SELECT stock FROM products WHERE id = 1');
      expect(prodRes.rows[0].stock).toBe(8);
    });

    it('E3: unpaid pending order returns 409 NOT_CLAIMABLE', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/pickup-claim`)
        .expect(409);

      expect(res.body.error.code).toBe('NOT_CLAIMABLE');
    });

    it('E8: already claimed order returns 409 ALREADY_CLAIMED', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_double_claim',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'captured',
      };
      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(JSON.stringify(payload), TEST_SECRET))
        .send(payload)
        .expect(200);

      // First claim succeeds
      await request(app.getHttpServer()).post(`/orders/${order.body.orderId}/pickup-claim`).expect(200);

      // Second claim fails
      const res = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/pickup-claim`)
        .expect(409);

      expect(res.body.error.code).toBe('ALREADY_CLAIMED');
    });

    it('E9: concurrency: two simultaneous pickup claims: exactly one 200, one 409, stock decremented once', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 2 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_claim_race',
        orderId: order.body.orderId,
        amountPaise: 70000,
        status: 'captured',
      };
      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(JSON.stringify(payload), TEST_SECRET))
        .send(payload)
        .expect(200);

      // Two simultaneous claims
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post(`/orders/${order.body.orderId}/pickup-claim`),
        request(app.getHttpServer()).post(`/orders/${order.body.orderId}/pickup-claim`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Stock was 10, should now be exactly 8 (reduced only once)
      const prodRes = await pool.query('SELECT stock FROM products WHERE id = 1');
      expect(prodRes.rows[0].stock).toBe(8);
    });
  });

  // -------------------------------------------------------------
  // Health Check (Q9)
  // -------------------------------------------------------------
  describe('Health check', () => {
    it('GET /health returns 200 with database status ok', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
    });
  });

  // -------------------------------------------------------------
  // Customer Storefront Extensions: Cancellation, Shortage Breakdown,
  // Demo Mode, Locker Code, Payment-After-Cancel
  // -------------------------------------------------------------
  describe('Customer Storefront Extensions', () => {
    it('X1: POST /orders/:id/cancel cancels a pending order and restores available stock immediately', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 2 }] })
        .expect(201);

      let prodRes = await request(app.getHttpServer()).get('/products').expect(200);
      expect(prodRes.body.find((p: any) => p.id === 3).availableUnits).toBe(0);

      const cancelRes = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);

      expect(cancelRes.body.status).toBe('cancelled');

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);
      expect(getRes.body.status).toBe('cancelled');
      expect(getRes.body.cancelledAt).toBeDefined();

      prodRes = await request(app.getHttpServer()).get('/products').expect(200);
      expect(prodRes.body.find((p: any) => p.id === 3).availableUnits).toBe(2);
    });

    it('X2: POST /orders/:id/cancel is idempotent on already-cancelled order', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);

      const secondCancel = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);

      expect(secondCancel.body.status).toBe('cancelled');
    });

    it('X3: POST /orders/:id/cancel rejects paid or picked_up order with 409 NOT_CANCELLABLE', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const payload = {
        eventId: 'evt_cancel_paid_order',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'captured',
      };
      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(JSON.stringify(payload), TEST_SECRET))
        .send(payload)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(409);

      expect(res.body.error.code).toBe('NOT_CANCELLABLE');
    });

    it('X4: POST /orders returns 409 INSUFFICIENT_STOCK with item-level shortage details', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 3, quantity: 5 }] })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.details).toBeDefined();
      expect(Array.isArray(res.body.error.details.shortages)).toBe(true);
      expect(res.body.error.details.shortages[0]).toEqual({
        productId: 3,
        name: 'Handmade Ceramic Mug',
        requested: 5,
        available: 2,
      });
    });

    it('X5: POST /orders validates maximum quantity per item and line limits', async () => {
      const resExcessQty = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 100 }] })
        .expect(400);

      expect(resExcessQty.body.error.code).toBe('VALIDATION_ERROR');

      const resZeroQty = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 0 }] })
        .expect(400);

      expect(resZeroQty.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('X6: Order creation assigns server-generated locker number and 4-digit pickup code', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);

      expect(getRes.body.lockerNumber).toBeGreaterThanOrEqual(1);
      expect(getRes.body.lockerNumber).toBeLessThanOrEqual(24);
      expect(typeof getRes.body.pickupCode).toBe('string');
      expect(getRes.body.pickupCode).toMatch(/^\d{4}$/);
    });

    it('X7: POST /payments/demo/:orderId marks pending order as paid with server-calculated amount', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 2 }] })
        .expect(201);

      const demoRes = await request(app.getHttpServer())
        .post(`/payments/demo/${order.body.orderId}`)
        .expect(200);

      expect(demoRes.body.outcome).toBe('paid');

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);

      expect(getRes.body.status).toBe('paid');
      expect(getRes.body.paidAt).toBeDefined();

      const eventRes = await pool.query('SELECT event_id, outcome FROM payment_events WHERE order_id = $1', [
        order.body.orderId,
      ]);
      expect(eventRes.rows.length).toBe(1);
      expect(eventRes.rows[0].event_id).toMatch(/^demo_/);
      expect(eventRes.rows[0].outcome).toBe('paid');
    });

    it('X8: Payment arriving after cancellation marks order needs_review with refund_flag', async () => {
      const order = await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/orders/${order.body.orderId}/cancel`)
        .expect(200);

      const payload = {
        eventId: 'evt_inflight_after_cancel',
        orderId: order.body.orderId,
        amountPaise: 35000,
        status: 'captured',
      };
      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-signature', signPayload(JSON.stringify(payload), TEST_SECRET))
        .send(payload)
        .expect(200);

      expect(res.body.outcome).toBe('needs_review');

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${order.body.orderId}`)
        .expect(200);

      expect(getRes.body.status).toBe('needs_review');
      expect(getRes.body.reviewReason).toBe('payment_after_cancel');
      expect(getRes.body.refundFlag).toBe(true);
    });

    it('X9: GET /health reports demoMode and holdSeconds', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.demoMode).toBe(true);
      expect(res.body.holdSeconds).toBe(2);
    });
  });
});
