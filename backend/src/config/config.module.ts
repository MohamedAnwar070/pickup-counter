import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // npm workspaces run from backend/, so read both backend/.env and the
      // repository-level .env. Tests supply environment variables directly.
      envFilePath: ['.env', '../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: (config: Record<string, unknown>) => {
        const parsed = envSchema.safeParse(config);
        if (!parsed.success) {
          const errors = parsed.error.format();
          console.error('❌ Environment validation failed:', JSON.stringify(errors, null, 2));
          throw new Error(`Environment validation failed: ${parsed.error.message}`);
        }
        return parsed.data;
      },
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
