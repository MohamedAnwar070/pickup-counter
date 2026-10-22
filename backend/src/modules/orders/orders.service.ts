import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';
import { OrdersRepo } from './orders.repo';
import { InventoryRepo } from '../inventory/inventory.repo';
import { CreateOrderDto, mergeLineItems } from './orders.schema';
import { AppError } from '../../common/errors/app-error';
import {
  CreateOrderResponse,
  GetOrderResponse,
  HOLD_SECONDS as DEFAULT_HOLD_SECONDS,
} from '@pickup-counter/shared';

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
    // Sort product IDs ascending to eliminate locking deadlocks
    mergedItems.sort((a, b) => a.productId - b.productId);
    const productIds = mergedItems.map((i) => i.productId);

    return this.db.withTransaction(async (client) => {
      // 1. Lock product rows in fixed ascending ID order
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

      // Verify all products exist
      for (const item of mergedItems) {
        if (!productsById.has(item.productId)) {
          throw new AppError(
            'PRODUCT_NOT_FOUND',
            `Product with ID ${item.productId} was not found`,
            HttpStatus.NOT_FOUND,
          );
        }
      }

      // 2. Compute current held units inside the transaction
      const heldMap = await this.inventoryRepo.getHeldUnits(client, productIds);

      // 3. Check availability for each requested item
      for (const item of mergedItems) {
        const prod = productsById.get(item.productId)!;
        const held = heldMap.get(item.productId) || 0;
        const available = prod.stock - held;

        if (available < item.quantity) {
          throw new AppError(
            'INSUFFICIENT_STOCK',
            `Insufficient stock for "${prod.name}". Requested ${item.quantity}, but only ${Math.max(0, available)} available.`,
            HttpStatus.CONFLICT,
          );
        }
      }

      // 4. Calculate total paise from verified server prices
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

      // 5. Insert order and order items
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
      reviewReason: order.review_reason,
      refundFlag: order.refund_flag,
      items: items.map((i) => ({
        productId: i.product_id,
        name: i.name,
        quantity: i.quantity,
        unitPricePaise: i.unit_price_paise,
      })),
    };
  }
}
