import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthResponse } from '@pickup-counter/shared';
import { DatabaseService } from '../../common/database/database.service';
import { HOLD_SECONDS as DEFAULT_HOLD_SECONDS } from '@pickup-counter/shared';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    await this.db.query('SELECT 1');
    return {
      status: 'ok',
      database: 'connected',
      demoMode: this.configService.get<boolean>('DEMO_MODE') === true,
      holdSeconds:
        this.configService.get<number>('HOLD_SECONDS') || DEFAULT_HOLD_SECONDS,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
