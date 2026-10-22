import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface ProductRow {
  id: number;
  name: string;
  price_paise: number;
  stock: number;
  category: string;
  description: string;
  image_url: string;
  tagline: string;
}

const PRODUCT_COLUMNS = `
  id, name, price_paise, stock, category, description, image_url, tagline
`;

@Injectable()
export class ProductsRepo {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<ProductRow[]> {
    const result = await this.db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY id ASC`,
    );
    return result.rows;
  }

  async findByIds(ids: number[]): Promise<ProductRow[]> {
    if (ids.length === 0) return [];
    const result = await this.db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ANY($1) ORDER BY id ASC`,
      [ids],
    );
    return result.rows;
  }
}
