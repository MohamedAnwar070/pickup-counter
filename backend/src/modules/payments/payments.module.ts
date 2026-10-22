import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepo } from './payments.repo';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepo],
  exports: [PaymentsService, PaymentsRepo],
})
export class PaymentsModule {}
