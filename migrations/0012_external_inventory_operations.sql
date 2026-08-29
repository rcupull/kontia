CREATE TABLE external_inventory_operations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  operation_key TEXT NOT NULL UNIQUE,
  quantity REAL NOT NULL CHECK (quantity > 0),
  external_reference TEXT NOT NULL,
  source_system TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reversed_at TEXT,
  reversal_reference TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE external_inventory_operation_items (
  operation_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (operation_id, batch_id),
  FOREIGN KEY (operation_id) REFERENCES external_inventory_operations(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

CREATE TABLE external_inventory_reversals (
  operation_id TEXT PRIMARY KEY,
  reversal_reference TEXT NOT NULL,
  source_system TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (operation_id) REFERENCES external_inventory_operations(id)
);

CREATE INDEX idx_external_inventory_operations_product
  ON external_inventory_operations(business_id, product_id, created_at DESC);
