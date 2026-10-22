import { Module } from '@nestjs/common';
import { PickupController } from './pickup.controller';
import { PickupService } from './pickup.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [PickupController],
  providers: [PickupService],
  exports: [PickupService],
})
export class PickupModule {}
