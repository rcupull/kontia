PRAGMA defer_foreign_keys = ON;

CREATE TABLE inventory_movements_new (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  source_location_id TEXT,
  destination_location_id TEXT,
  sale_id TEXT,
  sale_refund_id TEXT,
  production_batch_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase', 'sale', 'customerReturn', 'production', 'inventoryInjection',
    'positiveAdjustment', 'internalConsumption', 'externalSale', 'ownerWithdrawal', 'waste',
    'negativeAdjustment', 'transfer', 'transformation', 'disassembly',
    'disassemblyReturn'
  )),
  quantity REAL NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_by_user_id TEXT,
  compensation_unit_cost_cents INTEGER CHECK (compensation_unit_cost_cents >= 0),
  compensation_total_cost_cents INTEGER CHECK (compensation_total_cost_cents >= 0),
  compensation_payment_method TEXT CHECK (compensation_payment_method IN ('cash', 'card')),
  compensation_paid_at TEXT,
  compensation_paid_by_user_id TEXT,
  compensation_payment_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (source_location_id) REFERENCES locations(id),
  FOREIGN KEY (destination_location_id) REFERENCES locations(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (sale_refund_id) REFERENCES sale_refunds(id),
  FOREIGN KEY (production_batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (compensation_paid_by_user_id) REFERENCES users(id),
  CHECK (source_location_id IS NOT NULL OR destination_location_id IS NOT NULL),
  CHECK (movement_type <> 'transfer' OR (
    source_location_id IS NOT NULL AND destination_location_id IS NOT NULL
    AND source_location_id <> destination_location_id
  ))
);

INSERT INTO inventory_movements_new SELECT * FROM inventory_movements;
DROP TABLE inventory_movements;
ALTER TABLE inventory_movements_new RENAME TO inventory_movements;

CREATE INDEX idx_movements_business_product ON inventory_movements(business_id, product_id, created_at DESC);
CREATE INDEX idx_movements_batch ON inventory_movements(business_id, batch_id, created_at DESC);
CREATE INDEX idx_movements_locations ON inventory_movements(business_id, source_location_id, destination_location_id, created_at DESC);
CREATE INDEX idx_movements_sale ON inventory_movements(business_id, sale_id);
CREATE INDEX idx_movements_refund ON inventory_movements(business_id, sale_refund_id);
CREATE INDEX idx_movements_production ON inventory_movements(business_id, production_batch_id);
