import { Injectable, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { InventoryRepo } from '../inventory/inventory.repo';
import { AppError } from '../../common/errors/app-error';
import { PickupClaimResponse, OrderStatus } from '../../common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PickupService {
  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryRepo: InventoryRepo,
  ) {}

  async claimPickup(orderId: string): Promise<PickupClaimResponse> {
    if (!UUID_REGEX.test(orderId)) {
      throw new AppError('INVALID_UUID', 'Invalid order ID format. Must be a valid UUID.', HttpStatus.BAD_REQUEST);
    }

    return this.db.withTransaction(async (client) => {
      // 1. Atomic conditional update to claim order
      const updateRes = await client.query<{ id: string }>(
        `UPDATE orders
         SET status = 'picked_up', picked_up_at = clock_timestamp()
         WHERE id = $1 AND status = 'paid'
         RETURNING id`,
        [orderId],
      );

      // 2. If no rows updated, investigate current order state
      if (updateRes.rows.length === 0) {
        const orderRes = await client.query<{ id: string; status: OrderStatus }>(
          'SELECT id, status FROM orders WHERE id = $1',
          [orderId],
        );

        if (orderRes.rows.length === 0) {
          throw new AppError('ORDER_NOT_FOUND', `Order with ID ${orderId} not found`, HttpStatus.NOT_FOUND);
        }

        const currentStatus = orderRes.rows[0].status;
        if (currentStatus === 'picked_up') {
          throw new AppError('ALREADY_CLAIMED', 'This order has already been picked up', HttpStatus.CONFLICT);
        }

        throw new AppError(
          'NOT_CLAIMABLE',
          `Order is in "${currentStatus}" status and cannot be claimed`,
          HttpStatus.CONFLICT,
        );
      }

      // 3. One row updated! Decrement stock permanently in the same transaction
      const itemsRes = await client.query<{ product_id: number; quantity: number }>(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id ASC',
        [orderId],
      );

      const items = itemsRes.rows.map((row) => ({
        productId: row.product_id,
        quantity: row.quantity,
      }));

      await this.inventoryRepo.decrementStock(client, items);

      return { status: 'picked_up' };
    });
  }
}
