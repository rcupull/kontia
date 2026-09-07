PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

DROP INDEX idx_investment_entries_business;
DROP INDEX idx_investment_entries_investor;
DROP INDEX idx_investment_entries_batch;

ALTER TABLE investment_entries RENAME TO investment_entries_before_fk_repair;

CREATE TABLE investment_entries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  investor_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'openingCapital', 'contribution', 'profitDistribution', 'capitalWithdrawal'
  )),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  units_micros INTEGER NOT NULL DEFAULT 0,
  pre_money_valuation_cents INTEGER CHECK (
    pre_money_valuation_cents IS NULL OR pre_money_valuation_cents > 0
  ),
  affects_cash INTEGER NOT NULL DEFAULT 1 CHECK (affects_cash IN (0, 1)),
  financial_movement_id TEXT,
  entry_date TEXT NOT NULL,
  notes TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (investor_id) REFERENCES investors(id),
  FOREIGN KEY (financial_movement_id) REFERENCES financial_movements(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CHECK (
    (entry_type = 'profitDistribution' AND units_micros = 0)
    OR (entry_type IN ('openingCapital', 'contribution') AND units_micros > 0)
    OR (entry_type = 'capitalWithdrawal' AND units_micros < 0)
  ),
  CHECK ((affects_cash = 0 AND financial_movement_id IS NULL) OR affects_cash = 1)
);

INSERT INTO investment_entries (
  id,business_id,investor_id,batch_id,entry_type,amount_cents,units_micros,
  pre_money_valuation_cents,affects_cash,financial_movement_id,entry_date,notes,
  created_by_user_id,created_at
)
SELECT
  id,business_id,investor_id,batch_id,entry_type,amount_cents,units_micros,
  pre_money_valuation_cents,affects_cash,financial_movement_id,entry_date,notes,
  created_by_user_id,created_at
FROM investment_entries_before_fk_repair;

DROP TABLE investment_entries_before_fk_repair;

CREATE INDEX idx_investment_entries_business
  ON investment_entries(business_id, entry_date DESC, id DESC);
CREATE INDEX idx_investment_entries_investor
  ON investment_entries(business_id, investor_id, entry_date DESC);
CREATE INDEX idx_investment_entries_batch
  ON investment_entries(business_id, batch_id);

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
