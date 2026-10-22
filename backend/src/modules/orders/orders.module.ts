import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepo } from './orders.repo';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepo],
  exports: [OrdersService, OrdersRepo],
})
export class OrdersModule {}
