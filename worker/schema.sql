PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fx_rate REAL NOT NULL DEFAULT 95.75,
  gst_inr REAL NOT NULL DEFAULT 45,
  platform_fee_inr REAL NOT NULL DEFAULT 0,
  buy_commission_usd REAL NOT NULL DEFAULT 0.01,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Stock',
  allocation_pct REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  last_price REAL,
  price_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS funding (
  id TEXT PRIMARY KEY,
  funding_date TEXT NOT NULL,
  inr_sent REAL NOT NULL,
  fx_rate REAL NOT NULL,
  gst_inr REAL NOT NULL DEFAULT 0,
  platform_fee_inr REAL NOT NULL DEFAULT 0,
  other_fees_inr REAL NOT NULL DEFAULT 0,
  usd_credited REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monthly_plans (
  month TEXT PRIMARY KEY,
  budget_usd REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_date TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price_per_share REAL NOT NULL DEFAULT 0,
  total_spend_usd REAL NOT NULL,
  commission_usd REAL NOT NULL DEFAULT 0,
  shares REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_asset ON orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_funding_date ON funding(funding_date DESC);
