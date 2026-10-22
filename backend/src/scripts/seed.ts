import { Client } from 'pg';
import { loadLocalEnv } from '../common/config/load-env';

loadLocalEnv();

export const INITIAL_PRODUCTS = [
  {
    name: 'Artisan Sourdough Loaf',
    pricePaise: 35000,
    stock: 10,
    category: 'Bakery',
    tagline: 'Baked fresh at 6 AM',
    description: 'Naturally fermented 36-hour dough with a crackling blistered crust.',
    imageUrl: '/images/products/sourdough.jpg',
  },
  {
    name: 'Cold Brew Concentrate (500ml)',
    pricePaise: 42000,
    stock: 8,
    category: 'Cold Brew & Roasts',
    tagline: 'Steeped for 20 hours',
    description: 'Single-origin Arabica cold-water extraction with chocolate undertones.',
    imageUrl: '/images/products/coldbrew.jpg',
  },
  {
    name: 'Handmade Ceramic Mug',
    pricePaise: 65000,
    stock: 5,
    category: 'Studio Ceramics',
    tagline: 'Hand-thrown in the studio',
    description: 'Earthy terracotta with a speckled ivory, food-safe matte glaze.',
    imageUrl: '/images/products/ceramic-mug.jpg',
  },
  {
    name: 'Organic Mountain Honey (250g)',
    pricePaise: 48000,
    stock: 12,
    category: 'Mountain Pantry',
    tagline: '100% raw and wild',
    description: 'Unprocessed high-altitude wildflower honey harvested from forest hives.',
    imageUrl: '/images/products/honey.jpg',
  },
  {
    name: 'Espresso Roast Beans (250g)',
    pricePaise: 55000,
    stock: 15,
    category: 'Cold Brew & Roasts',
    tagline: 'Medium-dark roast',
    description: 'Estate-grown whole beans roasted weekly in small artisan batches.',
    imageUrl: '/images/products/coffee-beans.jpg',
  },
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
        `INSERT INTO products (name, price_paise, stock, category, description, image_url, tagline)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          prod.name,
          prod.pricePaise,
          prod.stock,
          prod.category,
          prod.description,
          prod.imageUrl,
          prod.tagline,
        ],
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
