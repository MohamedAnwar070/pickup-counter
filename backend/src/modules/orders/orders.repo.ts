import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { OrderStatus } from '@pickup-counter/shared';

export interface OrderDetailRow {
  id: string;
  status: OrderStatus;
  total_paise: number;
  expires_at: string;
  paid_at: string | null;
  paid_amount_paise: number | null;
  review_reason: string | null;
  refund_flag: boolean;
  picked_up_at: string | null;
  cancelled_at: string | null;
  locker_number: number | null;
  pickup_code: string | null;
  created_at: string;
  expires_in_seconds: number;
}

export interface OrderItemDetailRow {
  product_id: number;
  name: string;
  quantity: number;
  unit_price_paise: number;
}

@Injectable()
export class OrdersRepo {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Inserts an order and its items in a transaction using the database clock
   * for expires_at. A lane number and a four-digit pickup code are allocated
   * once and remain stable for the life of the order.
   */
  async createOrderInTx(
    client: PoolClient,
    totalPaise: number,
    holdSeconds: number,
    items: Array<{ productId: number; quantity: number; unitPricePaise: number }>,
  ): Promise<{ orderId: string; status: OrderStatus; totalPaise: number; expiresInSeconds: number }> {
    const orderSql = `
      INSERT INTO orders (
        status,
        total_paise,
        expires_at,
        locker_number,
        pickup_code
      )
      VALUES (
        'pending',
        $1,
        clock_timestamp() + ($2 || ' seconds')::interval,
        ((nextval('order_locker_seq') - 1) % 24) + 1,
        lpad((floor(random() * 10000))::int::text, 4, '0')
      )
      RETURNING
        id,
        status,
        total_paise,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))::int AS expires_in_seconds;
    `;

    const orderRes = await client.query<{
      id: string;
      status: OrderStatus;
      total_paise: number;
      expires_in_seconds: number;
    }>(orderSql, [totalPaise, holdSeconds]);

    const order = orderRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_paise)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, item.unitPricePaise],
      );
    }

    return {
      orderId: order.id,
      status: order.status,
      totalPaise: order.total_paise,
      expiresInSeconds: order.expires_in_seconds,
    };
  }

  /**
   * Finds an order by ID with the expire-on-read guarantee. The database clock
   * is authoritative; no client timestamp is ever trusted.
   */
  async findById(id: string): Promise<{ order: OrderDetailRow; items: OrderItemDetailRow[] } | null> {
    await this.db.query(
      `UPDATE orders
       SET status = 'expired'
       WHERE id = $1 AND status = 'pending' AND expires_at <= clock_timestamp()`,
      [id],
    );

    const orderSql = `
      SELECT
        o.id,
        o.status,
        o.total_paise,
        o.expires_at,
        o.paid_at,
        o.paid_amount_paise,
        o.review_reason,
        o.refund_flag,
        o.picked_up_at,
        o.cancelled_at,
        o.locker_number,
        o.pickup_code,
        o.created_at,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (o.expires_at - clock_timestamp()))))::int AS expires_in_seconds
      FROM orders o
      WHERE o.id = $1;
    `;

    const orderRes = await this.db.query<OrderDetailRow>(orderSql, [id]);
    if (orderRes.rows.length === 0) {
      return null;
    }

    const itemsSql = `
      SELECT
        oi.product_id,
        p.name,
        oi.quantity,
        oi.unit_price_paise
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.product_id ASC;
    `;

    const itemsRes = await this.db.query<OrderItemDetailRow>(itemsSql, [id]);

    return {
      order: orderRes.rows[0],
      items: itemsRes.rows,
    };
  }
}
