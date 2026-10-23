import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { PaymentsRepo } from './payments.repo';
import { InventoryRepo } from '../inventory/inventory.repo';
import { NormalizedWebhookPayload } from './payments.schema';
import { WebhookResponse, OrderStatus } from '@pickup-counter/shared';
import { AppError } from '../../common/errors/app-error';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly paymentsRepo: PaymentsRepo,
    private readonly inventoryRepo: InventoryRepo,
  ) {}

  async handleWebhook(
    payload: NormalizedWebhookPayload,
    rawJson: Record<string, unknown>,
  ): Promise<WebhookResponse> {
    const { eventId, orderId, amountPaise, status } = payload;
    this.logger.log(`Processing payment webhook eventId=${eventId} orderId=${orderId} status=${status} amount=${amountPaise}`);

    return this.db.withTransaction(async (client) => {
      // 1. Idempotency: insert event row
      const isNew = await this.paymentsRepo.insertEvent(client, {
        eventId,
        orderId: UUID_REGEX.test(orderId) ? orderId : null,
        amountPaise,
        status,
        rawBody: rawJson,
      });

      if (!isNew) {
        this.logger.log(`Duplicate event detected eventId=${eventId} orderId=${orderId}. Skipping.`);
        return { duplicate: true };
      }

      // Check UUID validity
      if (!UUID_REGEX.test(orderId)) {
        this.logger.warn(`Invalid UUID orderId=${orderId} for eventId=${eventId}. Ignored.`);
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'ignored');
        return { outcome: 'ignored' };
      }

      // 2. Lock order row
      const orderRes = await client.query<{
        id: string;
        status: OrderStatus;
        total_paise: number;
      }>(
        `SELECT id, status, total_paise
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [orderId],
      );

      if (orderRes.rows.length === 0) {
        this.logger.warn(`Order not found orderId=${orderId} for eventId=${eventId}. Ignored.`);
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'ignored');
        return { outcome: 'ignored' };
      }

      const order = orderRes.rows[0];

      // 3. Ignore non-captured statuses or orders that are already terminal/paid/reviewed
      if (
        status !== 'captured' ||
        order.status === 'paid' ||
        order.status === 'picked_up' ||
        order.status === 'needs_review'
      ) {
        this.logger.log(
          `Webhook ignored for orderId=${orderId} eventId=${eventId} (status=${status}, orderStatus=${order.status})`,
        );
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'ignored');
        return { outcome: 'ignored' };
      }

      // 4. The customer released the hold but a payment was already in flight.
      //    Never silently keep the money: flag it for a staff refund decision.
      //    This is checked before the amount so any captured money on a
      //    cancelled order is refunded, even when the amount is also wrong.
      if (order.status === 'cancelled') {
        this.logger.warn(
          `Payment captured after orderId=${orderId} was cancelled. Marking needs_review with refund flag.`,
        );
        await client.query(
          `UPDATE orders
           SET status = 'needs_review',
               review_reason = 'payment_after_cancel',
               refund_flag = true
           WHERE id = $1`,
          [orderId],
        );
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'needs_review');
        return { outcome: 'needs_review' };
      }

      // 5. Amount mismatch check
      if (amountPaise !== order.total_paise) {
        this.logger.warn(
          `Amount mismatch for orderId=${orderId}: expected ${order.total_paise}, got ${amountPaise}. Marking needs_review.`,
        );
        await client.query(
          `UPDATE orders
           SET status = 'needs_review', review_reason = 'amount_mismatch'
           WHERE id = $1`,
          [orderId],
        );
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'needs_review');
        return { outcome: 'needs_review' };
      }

      // 6. Lock this order's product rows (ascending id, same order as
      //    createOrder) BEFORE deciding whether the payment is in time.
      //    createOrder treats a pending order as free stock the instant
      //    expires_at passes, so the in-time decision and the commit that makes
      //    it visible must not straddle the 120s boundary. Holding the product
      //    locks serialises us with every createOrder touching these products:
      //    one that starts after our decision waits for our commit and sees the
      //    order as paid; one that committed first is seen by the late-payment
      //    stock check below.
      const itemsRes = await client.query<{ product_id: number; quantity: number }>(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id ASC',
        [orderId],
      );

      const items = itemsRes.rows;
      const productIds = items.map((i) => i.product_id);

      const prodRes = await client.query<{ id: number; stock: number }>(
        'SELECT id, stock FROM products WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE',
        [productIds],
      );
      const stockMap = new Map(prodRes.rows.map((p) => [p.id, p.stock]));

      // Read the clock only now that the product locks are held.
      const expiryRes = await client.query<{ in_time: boolean }>(
        'SELECT expires_at > clock_timestamp() AS in_time FROM orders WHERE id = $1',
        [orderId],
      );

      // 7. Valid payment within hold period
      if (order.status === 'pending' && expiryRes.rows[0].in_time) {
        this.logger.log(`Valid in-time payment for orderId=${orderId}. Marking paid.`);
        await client.query(
          `UPDATE orders
           SET status = 'paid', paid_at = clock_timestamp(), paid_amount_paise = $2
           WHERE id = $1`,
          [orderId, amountPaise],
        );
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'paid');
        return { outcome: 'paid' };
      }

      // 8. Late payment handling (order is expired, or pending but past expiry)
      this.logger.log(`Late payment arrived for orderId=${orderId}. Evaluating stock availability...`);

      // Calculate held units
      const heldMap = await this.inventoryRepo.getHeldUnits(client, productIds);

      // Check if stock is available for all lines
      let stockAvailable = true;
      for (const item of items) {
        const stock = stockMap.get(item.product_id) || 0;
        const held = heldMap.get(item.product_id) || 0;
        const available = stock - held;

        if (available < item.quantity) {
          stockAvailable = false;
          break;
        }
      }

      if (stockAvailable) {
        this.logger.log(`Stock is still free for late payment on orderId=${orderId}. Marking paid_late.`);
        await client.query(
          `UPDATE orders
           SET status = 'paid', paid_at = clock_timestamp(), paid_amount_paise = $2
           WHERE id = $1`,
          [orderId, amountPaise],
        );
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'paid_late');
        return { outcome: 'paid_late' };
      } else {
        this.logger.warn(
          `Stock is depleted for late payment on orderId=${orderId}. Marking needs_review with refund flag.`,
        );
        await client.query(
          `UPDATE orders
           SET status = 'needs_review', review_reason = 'late_payment_stock_gone', refund_flag = true
           WHERE id = $1`,
          [orderId],
        );
        await this.paymentsRepo.updateEventOutcome(client, eventId, 'needs_review');
        return { outcome: 'needs_review' };
      }
    });
  }

  /**
   * Demo-only checkout. The browser supplies only an order id; the server reads
   * the amount and runs it through the same payment state machine as a real
   * webhook. Gated by DEMO_MODE and never available in production by default.
   */
  async handleDemoPayment(orderId: string): Promise<WebhookResponse> {
    if (!UUID_REGEX.test(orderId)) {
      throw new AppError(
        'INVALID_UUID',
        'Invalid order ID format. Must be a valid UUID.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const orderRes = await this.db.query<{ total_paise: number }>(
      'SELECT total_paise FROM orders WHERE id = $1',
      [orderId],
    );

    if (orderRes.rows.length === 0) {
      throw new AppError(
        'ORDER_NOT_FOUND',
        `Order with ID ${orderId} was not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const amountPaise = orderRes.rows[0].total_paise;
    const rawBody = {
      demo: true,
      eventId: `demo_${randomUUID()}`,
      orderId,
      amountPaise,
      status: 'captured',
    };

    return this.handleWebhook(
      {
        eventId: rawBody.eventId,
        orderId,
        amountPaise,
        status: 'captured',
      },
      rawBody,
    );
  }
}
