import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from './bootstrap';

async function bootstrap() {
  const app = await createApp();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port);
  Logger.log(`🚀 Pickup Counter API running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('Failed to start Pickup Counter application', err, 'Bootstrap');
  process.exit(1);
});
