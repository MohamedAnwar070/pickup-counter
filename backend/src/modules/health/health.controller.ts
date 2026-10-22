import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async getHealth() {
    await this.db.query('SELECT 1');
    return {
      status: 'ok',
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
