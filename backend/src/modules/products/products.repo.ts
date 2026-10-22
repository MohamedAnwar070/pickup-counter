import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface ProductRow {
  id: number;
  name: string;
  price_paise: number;
  stock: number;
}

@Injectable()
export class ProductsRepo {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<ProductRow[]> {
    const result = await this.db.query<ProductRow>(
      'SELECT id, name, price_paise, stock FROM products ORDER BY id ASC',
    );
    return result.rows;
  }

  async findByIds(ids: number[]): Promise<ProductRow[]> {
    if (ids.length === 0) return [];
    const result = await this.db.query<ProductRow>(
      'SELECT id, name, price_paise, stock FROM products WHERE id = ANY($1) ORDER BY id ASC',
      [ids],
    );
    return result.rows;
  }
}
