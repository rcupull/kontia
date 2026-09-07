PRAGMA foreign_keys = ON;

-- El rol de portal se modela como extensión para no reconstruir users, tabla
-- referenciada por todos los libros operativos del sistema.
CREATE TABLE investor_user_roles (
  user_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE user_investor_access (
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  investor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, investor_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (investor_id) REFERENCES investors(id)
);
CREATE INDEX idx_user_investor_access_business
  ON user_investor_access(business_id, user_id);

CREATE TABLE investment_valuation_snapshots (
  business_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  treasury_cents INTEGER NOT NULL,
  inventory_cents INTEGER NOT NULL,
  total_equity_cents INTEGER NOT NULL,
  total_units_micros INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_id, snapshot_date),
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);
