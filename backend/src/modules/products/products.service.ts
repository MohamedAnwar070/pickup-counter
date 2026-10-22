import { Injectable } from '@nestjs/common';
import { ProductsRepo } from './products.repo';
import { InventoryRepo, computeAvailable } from '../inventory/inventory.repo';
import { Product } from '@pickup-counter/shared';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepo: ProductsRepo,
    private readonly inventoryRepo: InventoryRepo,
  ) {}

  async listProducts(): Promise<Product[]> {
    const products = await this.productsRepo.findAll();
    if (products.length === 0) {
      return [];
    }

    const productIds = products.map((p) => p.id);
    const heldUnitsMap = await this.inventoryRepo.getHeldUnits(undefined, productIds);

    return products.map((p) => {
      const held = heldUnitsMap.get(p.id) || 0;
      const availableUnits = computeAvailable(p.stock, held);
      return {
        id: p.id,
        name: p.name,
        pricePaise: p.price_paise,
        stock: p.stock,
        availableUnits,
      };
    });
  }
}
