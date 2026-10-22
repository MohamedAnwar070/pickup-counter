CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  stock       INTEGER NOT NULL CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status            TEXT NOT NULL CHECK (status IN ('pending','paid','expired','needs_review','picked_up')),
  total_paise       INTEGER NOT NULL CHECK (total_paise >= 0),
  expires_at        TIMESTAMPTZ NOT NULL,
  paid_at           TIMESTAMPTZ,
  paid_amount_paise INTEGER,
  review_reason     TEXT,
  refund_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  picked_up_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id     TEXT PRIMARY KEY,
  order_id     UUID,
  amount_paise INTEGER NOT NULL,
  status       TEXT NOT NULL,
  outcome      TEXT,
  raw_body     JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status_expiry ON orders (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items (product_id);
