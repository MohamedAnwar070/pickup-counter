import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from '@pickup-counter/shared';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(): Promise<Product[]> {
    return this.productsService.listProducts();
  }
}
