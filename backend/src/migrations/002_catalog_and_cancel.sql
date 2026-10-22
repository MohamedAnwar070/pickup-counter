-- R1/R2/R9 extensions: customer-facing catalog metadata and cancellable holds.
-- All statements are idempotent so the migration can be replayed safely.

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Pantry';
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tagline TEXT NOT NULL DEFAULT '';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locker_number INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_code TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','paid','expired','needs_review','picked_up','cancelled'));

CREATE SEQUENCE IF NOT EXISTS order_locker_seq;
CREATE INDEX IF NOT EXISTS idx_orders_customer_active
  ON orders (created_at DESC)
  WHERE status IN ('pending','paid','needs_review');

-- Enrich products created by the original seed. Price and stock are deliberately untouched.
UPDATE products SET
  category = 'Bakery',
  tagline = 'Baked fresh at 6 AM',
  description = 'Naturally fermented 36-hour dough with a crackling blistered crust.',
  image_url = '/images/products/sourdough.jpg'
WHERE name = 'Artisan Sourdough Loaf';

UPDATE products SET
  category = 'Cold Brew & Roasts',
  tagline = 'Steeped for 20 hours',
  description = 'Single-origin Arabica cold-water extraction with chocolate undertones.',
  image_url = '/images/products/coldbrew.jpg'
WHERE name = 'Cold Brew Concentrate (500ml)';

UPDATE products SET
  category = 'Studio Ceramics',
  tagline = 'Hand-thrown in the studio',
  description = 'Earthy terracotta with a speckled ivory, food-safe matte glaze.',
  image_url = '/images/products/ceramic-mug.jpg'
WHERE name = 'Handmade Ceramic Mug';

UPDATE products SET
  category = 'Mountain Pantry',
  tagline = '100% raw and wild',
  description = 'Unprocessed high-altitude wildflower honey harvested from forest hives.',
  image_url = '/images/products/honey.jpg'
WHERE name = 'Organic Mountain Honey (250g)';

UPDATE products SET
  category = 'Cold Brew & Roasts',
  tagline = 'Medium-dark roast',
  description = 'Estate-grown whole beans roasted weekly in small artisan batches.',
  image_url = '/images/products/coffee-beans.jpg'
WHERE name = 'Espresso Roast Beans (250g)';
