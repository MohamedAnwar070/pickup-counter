import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DatabaseService } from '../../common/database/database.service';

@Injectable()
export class ExpirySweeperService {
  private readonly logger = new Logger(ExpirySweeperService.name);

  constructor(private readonly db: DatabaseService) {}

  @Interval(5000)
  async sweepExpiredOrders(): Promise<number> {
    try {
      const res = await this.db.query<{ id: string }>(
        `UPDATE orders
         SET status = 'expired'
         WHERE status = 'pending' AND expires_at <= clock_timestamp()
         RETURNING id`,
      );

      const count = res.rows.length;
      if (count > 0) {
        this.logger.log(`Swept ${count} expired order(s): ${res.rows.map((r) => r.id).join(', ')}`);
      }
      return count;
    } catch (err: any) {
      this.logger.error(`Error in expiry sweeper: ${err.message}`);
      return 0;
    }
  }
}
