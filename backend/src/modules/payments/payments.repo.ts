import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

export interface InsertEventParams {
  eventId: string;
  orderId: string | null;
  amountPaise: number;
  status: string;
  rawBody: Record<string, unknown>;
}

@Injectable()
export class PaymentsRepo {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Inserts payment event using ON CONFLICT (event_id) DO NOTHING RETURNING event_id.
   * Returns true if newly inserted, false if duplicate.
   */
  async insertEvent(client: PoolClient, params: InsertEventParams): Promise<boolean> {
    const sql = `
      INSERT INTO payment_events (
        event_id,
        order_id,
        amount_paise,
        status,
        raw_body
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id;
    `;

    const res = await client.query<{ event_id: string }>(sql, [
      params.eventId,
      params.orderId,
      params.amountPaise,
      params.status,
      JSON.stringify(params.rawBody),
    ]);

    return res.rows.length > 0;
  }

  async updateEventOutcome(
    client: PoolClient,
    eventId: string,
    outcome: string,
  ): Promise<void> {
    await client.query('UPDATE payment_events SET outcome = $2 WHERE event_id = $1', [
      eventId,
      outcome,
    ]);
  }
}
