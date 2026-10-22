import { Controller, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { PickupService } from './pickup.service';
import { PickupClaimResponse } from '@pickup-counter/shared';

@Controller('orders')
export class PickupController {
  constructor(private readonly pickupService: PickupService) {}

  @Post(':id/pickup-claim')
  @HttpCode(HttpStatus.OK)
  async claimPickup(@Param('id') id: string): Promise<PickupClaimResponse> {
    return this.pickupService.claimPickup(id);
  }
}
