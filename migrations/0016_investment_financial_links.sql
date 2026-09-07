PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

DROP INDEX idx_financial_business_date;
ALTER TABLE financial_movements RENAME TO financial_movements_before_investments;

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
  related_entity_type TEXT CHECK (related_entity_type IN (
    'cashSession', 'saleRefund', 'investmentContribution',
    'investmentDistribution', 'investmentCapitalWithdrawal'
  )),
  related_entity_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

INSERT INTO financial_movements (
  id,business_id,type,expense_type,money_location,amount_cents,description,
  movement_date,notes,related_entity_type,related_entity_id,created_by_user_id,
  created_at,updated_at,deleted_at
)
SELECT
  id,business_id,type,expense_type,money_location,amount_cents,description,
  movement_date,notes,related_entity_type,related_entity_id,created_by_user_id,
  created_at,updated_at,deleted_at
FROM financial_movements_before_investments;

DROP TABLE financial_movements_before_investments;
CREATE INDEX idx_financial_business_date
  ON financial_movements(business_id, movement_date DESC);

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
