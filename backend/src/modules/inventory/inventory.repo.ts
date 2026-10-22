import { Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

/**
 * Pure function: compute available units from total stock and held units.
 * Never negative, clamped to 0.
 */
export function computeAvailable(stock: number, held: number): number {
  return Math.max(0, stock - held);
}

@Injectable()
export class InventoryRepo {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves held units for given product IDs using the database clock.
   * Held units = unexpired pending orders + paid orders (not yet picked up).
   */
  async getHeldUnits(
    dbClient: PoolClient | Pool | undefined,
    productIds: number[],
  ): Promise<Map<number, number>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const sql = `
      SELECT oi.product_id, SUM(oi.quantity)::int AS held
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = ANY($1)
        AND ( (o.status = 'pending' AND o.expires_at > clock_timestamp()) OR o.status = 'paid' )
      GROUP BY oi.product_id;
    `;

    const result = dbClient
      ? await dbClient.query<{ product_id: number; held: number }>(sql, [productIds])
      : await this.db.query<{ product_id: number; held: number }>(sql, [productIds]);
    const heldMap = new Map<number, number>();
    for (const row of result.rows) {
      heldMap.set(row.product_id, row.held);
    }
    return heldMap;
  }

  /**
   * Decrements stock permanently for items sorted by product ID.
   * Must be called inside an active transaction.
   */
  async decrementStock(
    client: PoolClient,
    items: Array<{ productId: number; quantity: number }>,
  ): Promise<void> {
    const sorted = [...items].sort((a, b) => a.productId - b.productId);
    for (const item of sorted) {
      await client.query(
        'UPDATE products SET stock = stock - $2 WHERE id = $1',
        [item.productId, item.quantity],
      );
    }
  }
}
