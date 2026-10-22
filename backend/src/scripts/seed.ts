import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export const INITIAL_PRODUCTS = [
  { name: 'Artisan Sourdough Loaf', pricePaise: 35000, stock: 10 },
  { name: 'Cold Brew Concentrate (500ml)', pricePaise: 42000, stock: 8 },
  { name: 'Handmade Ceramic Mug', pricePaise: 65000, stock: 5 },
  { name: 'Organic Mountain Honey (250g)', pricePaise: 48000, stock: 12 },
  { name: 'Espresso Roast Beans (250g)', pricePaise: 55000, stock: 15 },
];

export async function seedProducts(customDatabaseUrl?: string): Promise<void> {
  const connectionString = customDatabaseUrl || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for seed');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const res = await client.query('SELECT COUNT(*)::int AS count FROM products');
    const count = res.rows[0]?.count || 0;

    if (count > 0) {
      console.log(`ℹ️ Products table already has ${count} rows. Skipping seed.`);
      return;
    }

    console.log('Seeding initial products...');
    for (const prod of INITIAL_PRODUCTS) {
      await client.query(
        'INSERT INTO products (name, price_paise, stock) VALUES ($1, $2, $3)',
        [prod.name, prod.pricePaise, prod.stock],
      );
    }
    console.log(`✅ Seeded ${INITIAL_PRODUCTS.length} products.`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seedProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
