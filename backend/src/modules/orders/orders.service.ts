import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';
import { OrdersRepo } from './orders.repo';
import { InventoryRepo } from '../inventory/inventory.repo';
import { CreateOrderDto, mergeLineItems } from './orders.schema';
import { AppError } from '../../common/errors/app-error';
import {
  CancelOrderResponse,
  CreateOrderResponse,
  GetOrderResponse,
  HOLD_SECONDS as DEFAULT_HOLD_SECONDS,
  MAX_ORDER_QUANTITY,
  OrderStatus,
  StockShortage,
} from '../../common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrdersService {
  private readonly holdSeconds: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly ordersRepo: OrdersRepo,
    private readonly inventoryRepo: InventoryRepo,
    private readonly configService: ConfigService,
  ) {
    this.holdSeconds = this.configService.get<number>('HOLD_SECONDS') || DEFAULT_HOLD_SECONDS;
  }

  async createOrder(dto: CreateOrderDto): Promise<CreateOrderResponse> {
    const mergedItems = mergeLineItems(dto.items);

    // A per-line maximum can be bypassed by listing the same product twice
    // (for example 60 + 60). Validate the merged quantity as well.
    const oversizedLine = mergedItems.find(
      (item) => item.quantity > MAX_ORDER_QUANTITY,
    );
    if (oversizedLine) {
      throw new AppError(
        'VALIDATION_ERROR',
        `quantity cannot exceed ${MAX_ORDER_QUANTITY} units per product`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Sort product IDs ascending to eliminate locking deadlocks
    mergedItems.sort((a, b) => a.productId - b.productId);
    const productIds = mergedItems.map((i) => i.productId);

    return this.db.withTransaction(async (client) => {
      // 1. Lock product rows in fixed ascending ID order.
      const prodRes = await client.query<{
        id: number;
        name: string;
        price_paise: number;
        stock: number;
      }>(
        'SELECT id, name, price_paise, stock FROM products WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE',
        [productIds],
      );

      const productsById = new Map(prodRes.rows.map((p) => [p.id, p]));

      for (const item of mergedItems) {
        if (!productsById.has(item.productId)) {
          throw new AppError(
            'PRODUCT_NOT_FOUND',
            `Product with ID ${item.productId} was not found`,
            HttpStatus.NOT_FOUND,
          );
        }
      }

      // 2. Compute held units inside the transaction.
      const heldMap = await this.inventoryRepo.getHeldUnits(client, productIds);

      // 3. Check every line before writing anything so the customer receives
      //    the complete picture when several products lost a race at once.
      const shortages: StockShortage[] = [];
      for (const item of mergedItems) {
        const prod = productsById.get(item.productId)!;
        const held = heldMap.get(item.productId) || 0;
        const available = Math.max(0, prod.stock - held);

        if (available < item.quantity) {
          shortages.push({
            productId: item.productId,
            name: prod.name,
            requested: item.quantity,
            available,
          });
        }
      }

      if (shortages.length > 0) {
        const summary = shortages
          .map((s) => `${s.name} (${s.available} of ${s.requested} available)`)
          .join('; ');
        throw new AppError(
          'INSUFFICIENT_STOCK',
          `Stock changed while you were shopping: ${summary}.`,
          HttpStatus.CONFLICT,
          { shortages },
        );
      }

      // 4. Calculate the total from verified server prices.
      let totalPaise = 0;
      const itemsWithPrices = mergedItems.map((item) => {
        const prod = productsById.get(item.productId)!;
        const lineTotal = prod.price_paise * item.quantity;
        totalPaise += lineTotal;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPricePaise: prod.price_paise,
        };
      });

      // 5. Insert order and order items atomically.
      return this.ordersRepo.createOrderInTx(
        client,
        totalPaise,
        this.holdSeconds,
        itemsWithPrices,
      );
    });
  }

  async getOrder(id: string): Promise<GetOrderResponse> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError('INVALID_UUID', 'Invalid order ID format. Must be a valid UUID.', HttpStatus.BAD_REQUEST);
    }

    const result = await this.ordersRepo.findById(id);
    if (!result) {
      throw new AppError('ORDER_NOT_FOUND', `Order with ID ${id} was not found`, HttpStatus.NOT_FOUND);
    }

    const { order, items } = result;

    return {
      id: order.id,
      status: order.status,
      totalPaise: order.total_paise,
      expiresInSeconds: order.expires_in_seconds,
      holdSeconds: this.holdSeconds,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      pickedUpAt: order.picked_up_at,
      cancelledAt: order.cancelled_at,
      reviewReason: order.review_reason,
      refundFlag: order.refund_flag,
      lockerNumber: order.locker_number,
      pickupCode: order.pickup_code,
      items: items.map((i) => ({
        productId: i.product_id,
        name: i.name,
        quantity: i.quantity,
        unitPricePaise: i.unit_price_paise,
      })),
    };
  }

  /**
   * Releases a pending hold immediately. Cancellation is idempotent for an
   * already-cancelled order so a double click or retry is harmless.
   */
  async cancelOrder(id: string): Promise<CancelOrderResponse> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError('INVALID_UUID', 'Invalid order ID format. Must be a valid UUID.', HttpStatus.BAD_REQUEST);
    }

    return this.db.withTransaction(async (client) => {
      // Expire-on-read also applies when the customer cancels, otherwise a
      // hold that is already past its expiry would incorrectly say "pending".
      await client.query(
        `UPDATE orders
         SET status = 'expired'
         WHERE id = $1 AND status = 'pending' AND expires_at <= clock_timestamp()`,
        [id],
      );

      const updateRes = await client.query<{ id: string; status: OrderStatus }>(
        `UPDATE orders
         SET status = 'cancelled', cancelled_at = clock_timestamp()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, status`,
        [id],
      );

      if (updateRes.rows.length > 0) {
        return updateRes.rows[0];
      }

      const orderRes = await client.query<{ id: string; status: OrderStatus }>(
        'SELECT id, status FROM orders WHERE id = $1',
        [id],
      );

      if (orderRes.rows.length === 0) {
        throw new AppError('ORDER_NOT_FOUND', `Order with ID ${id} was not found`, HttpStatus.NOT_FOUND);
      }

      const order = orderRes.rows[0];
      if (order.status === 'cancelled') {
        return order;
      }

      throw new AppError(
        'NOT_CANCELLABLE',
        `This reservation is "${order.status}" and can no longer be cancelled.`,
        HttpStatus.CONFLICT,
        { status: order.status },
      );
    });
  }
}
