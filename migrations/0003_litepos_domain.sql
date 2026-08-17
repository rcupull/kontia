PRAGMA foreign_keys = OFF;

-- LitePOS mantiene estos valores en el negocio y el catálogo.
ALTER TABLE businesses ADD COLUMN sales_tax_percentage REAL NOT NULL DEFAULT 15
  CHECK (sales_tax_percentage >= 0 AND sales_tax_percentage <= 100);
ALTER TABLE businesses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
  CHECK (is_active IN (0, 1));
ALTER TABLE categories ADD COLUMN icon TEXT;
ALTER TABLE products ADD COLUMN type TEXT NOT NULL DEFAULT 'basic'
  CHECK (type IN ('basic', 'composite'));

-- Se conserva el historial del prototipo. El nuevo libro de inventario usa lotes,
-- como LitePOS, y pasa a ser la fuente de verdad para precios y existencias.
ALTER TABLE inventory_movements RENAME TO inventory_movements_legacy;

CREATE TABLE inventory_batches (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  supplier_invoice_id TEXT,
  initial_quantity REAL NOT NULL CHECK (initial_quantity >= 0),
  warehouse_quantity REAL NOT NULL CHECK (warehouse_quantity >= 0),
  pos_quantity REAL NOT NULL CHECK (pos_quantity >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  cash_price_cents INTEGER NOT NULL CHECK (cash_price_cents >= 0),
  card_price_cents INTEGER NOT NULL CHECK (card_price_cents >= 0),
  received_at TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  sale_id TEXT,
  sale_refund_id TEXT,
  production_batch_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase', 'sale', 'customerReturn', 'production', 'inventoryInjection',
    'positiveAdjustment', 'internalConsumption', 'ownerWithdrawal', 'waste',
    'posWaste', 'negativeAdjustment', 'transferToPos', 'transferToWarehouse',
    'transformation', 'disassembly', 'disassemblyReturn'
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
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (sale_refund_id) REFERENCES sale_refunds(id),
  FOREIGN KEY (production_batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (compensation_paid_by_user_id) REFERENCES users(id)
);

CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  opening_amount_cents INTEGER NOT NULL CHECK (opening_amount_cents >= 0),
  pos_snapshot TEXT,
  expected_cash_amount_cents INTEGER NOT NULL CHECK (expected_cash_amount_cents >= 0),
  counted_cash_amount_cents INTEGER CHECK (counted_cash_amount_cents >= 0),
  difference_cents INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  cash_session_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  batch_id TEXT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

CREATE TABLE sale_refunds (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE product_components (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  parent_product_id TEXT NOT NULL,
  component_product_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (parent_product_id) REFERENCES products(id),
  FOREIGN KEY (component_product_id) REFERENCES products(id),
  UNIQUE (business_id, parent_product_id, component_product_id),
  CHECK (parent_product_id <> component_product_id)
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_id TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE supplier_invoices (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  UNIQUE (business_id, supplier_id, invoice_number)
);

CREATE TABLE operating_expenses (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'salary', 'bonus', 'tax', 'rent', 'utilities', 'marketing', 'supplies',
    'maintenance', 'transportation', 'software', 'other'
  )),
  name TEXT NOT NULL,
  notes TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  expense_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE financial_movements (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'capitalInjection', 'sessionClose', 'operatingExpense', 'inventoryReinvestment',
    'ownerWithdrawal', 'saleRefund', 'positiveAdjustment', 'negativeAdjustment'
  )),
  expense_type TEXT,
  money_location TEXT NOT NULL CHECK (money_location IN ('cashDeposit', 'bankAccount')),
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  movement_date TEXT NOT NULL,
  notes TEXT,
  related_entity_type TEXT CHECK (related_entity_type IN ('cashSession', 'saleRefund')),
  related_entity_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- Convierte el estado actual del prototipo en un lote inicial por producto.
INSERT INTO inventory_batches (
  id, business_id, product_id, initial_quantity, warehouse_quantity, pos_quantity,
  unit_cost_cents, cash_price_cents, card_price_cents, received_at, created_at, updated_at
)
SELECT
  'migration-batch-' || id, business_id, id, current_stock, current_stock, 0,
  0, sale_price_cents, sale_price_cents, created_at, created_at, updated_at
FROM products
WHERE deleted_at IS NULL;

INSERT INTO inventory_movements (
  id, business_id, product_id, batch_id, movement_type, quantity, notes, created_at, updated_at
)
SELECT
  'migration-movement-' || id, business_id, id, 'migration-batch-' || id,
  'inventoryInjection', current_stock, 'Saldo migrado desde el inventario inicial',
  created_at, updated_at
FROM products
WHERE deleted_at IS NULL AND current_stock > 0;

CREATE INDEX idx_batches_business_product ON inventory_batches(business_id, product_id, deleted_at, received_at);
CREATE INDEX idx_batches_invoice ON inventory_batches(business_id, supplier_invoice_id);
CREATE INDEX idx_movements_business_product ON inventory_movements(business_id, product_id, created_at DESC);
CREATE INDEX idx_movements_batch ON inventory_movements(business_id, batch_id, created_at DESC);
CREATE INDEX idx_movements_sale ON inventory_movements(business_id, sale_id);
CREATE INDEX idx_movements_refund ON inventory_movements(business_id, sale_refund_id);
CREATE INDEX idx_movements_production ON inventory_movements(business_id, production_batch_id);
CREATE INDEX idx_sessions_business_status ON cash_sessions(business_id, status, opened_at DESC);
CREATE INDEX idx_sales_session ON sales(business_id, cash_session_id, created_at DESC);
CREATE INDEX idx_sale_items_sale ON sale_items(business_id, sale_id);
CREATE INDEX idx_refunds_sale ON sale_refunds(business_id, sale_id);
CREATE INDEX idx_components_parent ON product_components(business_id, parent_product_id);
CREATE INDEX idx_components_component ON product_components(business_id, component_product_id);
CREATE INDEX idx_suppliers_business_name ON suppliers(business_id, name, deleted_at);
CREATE INDEX idx_invoices_supplier ON supplier_invoices(business_id, supplier_id, invoice_date DESC);
CREATE INDEX idx_expenses_business_date ON operating_expenses(business_id, expense_date DESC);
CREATE INDEX idx_financial_business_date ON financial_movements(business_id, movement_date DESC);
CREATE INDEX idx_audit_entity ON audit_logs(business_id, entity_type, entity_id, created_at DESC);

PRAGMA foreign_keys = ON;
