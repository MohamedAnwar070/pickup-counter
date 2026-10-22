import { Module } from '@nestjs/common';
import { InventoryRepo } from './inventory.repo';

@Module({
  providers: [InventoryRepo],
  exports: [InventoryRepo],
})
export class InventoryModule {}
