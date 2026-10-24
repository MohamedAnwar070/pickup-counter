import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from '../../common';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(): Promise<Product[]> {
    return this.productsService.listProducts();
  }
}
