PRAGMA foreign_keys = ON;

-- La contabilidad de cada negocio continúa expresada en businesses.currency.
-- Esta tabla enumera esa moneda base y las monedas secundarias que el negocio
-- puede recibir o entregar.
CREATE TABLE business_currencies (
  business_id TEXT NOT NULL,
  currency_code TEXT NOT NULL COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_id, currency_code),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  CHECK (
    length(currency_code) = 3
    AND currency_code = upper(currency_code) COLLATE BINARY
  )
);

-- Una cuenta identifica dónde se conserva el saldo nominal de una moneda.
-- Las sesiones de POS mantienen además su arqueo detallado en
-- cash_session_currency_balances.
CREATE TABLE money_accounts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  account_type TEXT NOT NULL CHECK (account_type IN (
    'cashDrawer', 'bankAccount', 'reserve'
  )),
  currency_code TEXT NOT NULL COLLATE NOCASE,
  location_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id, currency_code)
    REFERENCES business_currencies(business_id, currency_code),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  UNIQUE (business_id, name, currency_code),
  UNIQUE (business_id, id, currency_code)
);

-- Cabecera auditable de una conversión entre dos monedas del mismo negocio.
-- Sus entradas y salidas se registran en monetary_components.
CREATE TABLE currency_exchanges (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  exchange_rate_scaled INTEGER NOT NULL CHECK (exchange_rate_scaled > 0),
  exchange_date TEXT NOT NULL,
  notes TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reversed_at TEXT,
  reversed_by_user_id TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (reversed_by_user_id) REFERENCES users(id),
  CHECK ((reversed_at IS NULL) = (reversed_by_user_id IS NULL))
);

-- Cada fila es una parte monetaria de una operación cuyo total contable está
-- expresado en la moneda base. exchange_rate_scaled usa escala 1 000 000:
-- una tasa de 665 CUP/USD se guarda como 665000000 y la moneda base como 1000000.
CREATE TABLE monetary_components (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'sale', 'saleRefund', 'supplierInvoice', 'financialMovement',
    'currencyExchange'
  )),
  operation_id TEXT NOT NULL,
  cash_session_id TEXT,
  money_account_id TEXT NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'transfer')),
  flow TEXT NOT NULL CHECK (flow IN ('inflow', 'outflow')),
  currency_code TEXT NOT NULL COLLATE NOCASE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  exchange_rate_scaled INTEGER NOT NULL CHECK (exchange_rate_scaled > 0),
  base_amount_cents INTEGER NOT NULL CHECK (base_amount_cents > 0),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY (business_id, currency_code)
    REFERENCES business_currencies(business_id, currency_code),
  FOREIGN KEY (business_id, money_account_id, currency_code)
    REFERENCES money_accounts(business_id, id, currency_code),
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- Apertura, saldo esperado y arqueo físico de cada moneda en una sesión.
CREATE TABLE cash_session_currency_balances (
  cash_session_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  currency_code TEXT NOT NULL COLLATE NOCASE,
  opening_amount_minor INTEGER NOT NULL DEFAULT 0
    CHECK (opening_amount_minor >= 0),
  expected_amount_minor INTEGER NOT NULL DEFAULT 0
    CHECK (expected_amount_minor >= 0),
  counted_amount_minor INTEGER CHECK (
    counted_amount_minor IS NULL OR counted_amount_minor >= 0
  ),
  difference_amount_minor INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cash_session_id, currency_code),
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (business_id, currency_code)
    REFERENCES business_currencies(business_id, currency_code)
);

CREATE INDEX idx_money_accounts_business
  ON money_accounts(business_id, currency_code, account_type, is_active, deleted_at);
CREATE INDEX idx_currency_exchanges_business
  ON currency_exchanges(business_id, exchange_date DESC);
CREATE INDEX idx_monetary_components_operation
  ON monetary_components(business_id, operation_type, operation_id);
CREATE INDEX idx_monetary_components_account
  ON monetary_components(business_id, money_account_id, created_at DESC);
CREATE INDEX idx_monetary_components_session
  ON monetary_components(business_id, cash_session_id, created_at DESC);
CREATE INDEX idx_session_currency_balances_business
  ON cash_session_currency_balances(business_id, currency_code, cash_session_id);

-- Compatibilidad: todos los datos históricos se consideran denominados en la
-- moneda base del negocio con una tasa 1:1.
INSERT INTO business_currencies (business_id, currency_code, created_at, updated_at)
SELECT id, upper(currency), created_at, updated_at
FROM businesses;

INSERT INTO money_accounts (
  id, business_id, name, account_type, currency_code, created_at, updated_at
)
SELECT
  'migration-cash-account-' || id,
  id,
  'Efectivo histórico',
  'cashDrawer',
  upper(currency),
  created_at,
  updated_at
FROM businesses;

INSERT INTO money_accounts (
  id, business_id, name, account_type, currency_code, created_at, updated_at
)
SELECT
  'migration-bank-account-' || id,
  id,
  'Cuenta bancaria histórica',
  'bankAccount',
  upper(currency),
  created_at,
  updated_at
FROM businesses;

INSERT INTO cash_session_currency_balances (
  cash_session_id, business_id, currency_code, opening_amount_minor,
  expected_amount_minor, counted_amount_minor, difference_amount_minor,
  created_at, updated_at
)
SELECT
  cs.id,
  cs.business_id,
  upper(b.currency),
  cs.opening_amount_cents,
  cs.expected_cash_amount_cents,
  cs.counted_cash_amount_cents,
  cs.difference_cents,
  cs.created_at,
  cs.updated_at
FROM cash_sessions cs
JOIN businesses b ON b.id = cs.business_id
WHERE cs.deleted_at IS NULL;

INSERT INTO monetary_components (
  id, business_id, operation_type, operation_id, cash_session_id,
  money_account_id, payment_method, flow, currency_code, amount_minor,
  exchange_rate_scaled, base_amount_cents, created_by_user_id, created_at, notes
)
SELECT
  'migration-sale-' || s.id,
  s.business_id,
  'sale',
  s.id,
  s.cash_session_id,
  CASE s.payment_method
    WHEN 'cash' THEN 'migration-cash-account-' || s.business_id
    ELSE 'migration-bank-account-' || s.business_id
  END,
  s.payment_method,
  'inflow',
  upper(b.currency),
  s.total_cents,
  1000000,
  s.total_cents,
  s.seller_id,
  s.created_at,
  'Componente migrado desde la venta original'
FROM sales s
JOIN businesses b ON b.id = s.business_id
WHERE s.deleted_at IS NULL AND s.total_cents > 0;

INSERT INTO monetary_components (
  id, business_id, operation_type, operation_id, cash_session_id,
  money_account_id, payment_method, flow, currency_code, amount_minor,
  exchange_rate_scaled, base_amount_cents, created_by_user_id, created_at, notes
)
SELECT
  'migration-refund-' || r.id,
  r.business_id,
  'saleRefund',
  r.id,
  s.cash_session_id,
  CASE s.payment_method
    WHEN 'cash' THEN 'migration-cash-account-' || s.business_id
    ELSE 'migration-bank-account-' || s.business_id
  END,
  s.payment_method,
  'outflow',
  upper(b.currency),
  s.total_cents,
  1000000,
  s.total_cents,
  r.created_by_user_id,
  r.created_at,
  'Componente migrado desde la devolución original'
FROM sale_refunds r
JOIN sales s ON s.id = r.sale_id AND s.business_id = r.business_id
JOIN businesses b ON b.id = r.business_id
WHERE r.deleted_at IS NULL AND s.total_cents > 0;

-- Los movimientos derivados de ventas, devoluciones y cierres no se vuelven a
-- insertar para evitar duplicar su efecto. Solo se migran movimientos financieros
-- independientes cuya procedencia histórica sí es inequívoca.
INSERT INTO monetary_components (
  id, business_id, operation_type, operation_id, money_account_id,
  payment_method, flow, currency_code, amount_minor, exchange_rate_scaled,
  base_amount_cents, created_by_user_id, created_at, notes
)
SELECT
  'migration-financial-' || fm.id,
  fm.business_id,
  'financialMovement',
  fm.id,
  CASE fm.money_location
    WHEN 'cashDeposit' THEN 'migration-cash-account-' || fm.business_id
    ELSE 'migration-bank-account-' || fm.business_id
  END,
  CASE fm.money_location
    WHEN 'cashDeposit' THEN 'cash'
    ELSE 'transfer'
  END,
  CASE
    WHEN fm.type IN ('capitalInjection', 'positiveAdjustment') THEN 'inflow'
    ELSE 'outflow'
  END,
  upper(b.currency),
  abs(fm.amount_cents),
  1000000,
  abs(fm.amount_cents),
  fm.created_by_user_id,
  fm.created_at,
  'Componente migrado desde el movimiento financiero original'
FROM financial_movements fm
JOIN businesses b ON b.id = fm.business_id
WHERE fm.deleted_at IS NULL
  AND fm.related_entity_type IS NULL
  AND fm.related_entity_id IS NULL
  AND fm.amount_cents <> 0;
