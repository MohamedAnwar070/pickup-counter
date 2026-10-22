import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PickupModule } from './modules/pickup/pickup.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    PickupModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule {}
