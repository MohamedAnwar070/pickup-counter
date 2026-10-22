import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UsePipes,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { createOrderSchema, CreateOrderDto } from './orders.schema';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CancelOrderResponse,
  CreateOrderResponse,
  GetOrderResponse,
} from '@pickup-counter/shared';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createOrderSchema))
  async createOrder(@Body() dto: CreateOrderDto): Promise<CreateOrderResponse> {
    return this.ordersService.createOrder(dto);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<GetOrderResponse> {
    return this.ordersService.getOrder(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(@Param('id') id: string): Promise<CancelOrderResponse> {
    return this.ordersService.cancelOrder(id);
  }
}
