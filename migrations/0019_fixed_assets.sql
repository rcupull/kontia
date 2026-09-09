PRAGMA foreign_keys = ON;

CREATE TABLE fixed_assets (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  investor_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'equipment',
  description TEXT,
  acquisition_date TEXT NOT NULL,
  original_value_cents INTEGER NOT NULL CHECK (original_value_cents > 0),
  accumulated_depreciation_cents INTEGER NOT NULL DEFAULT 0 CHECK (
    accumulated_depreciation_cents >= 0
    AND accumulated_depreciation_cents <= original_value_cents
  ),
  acquisition_type TEXT NOT NULL CHECK (acquisition_type IN ('purchase', 'inKindContribution')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (investor_id) REFERENCES investors(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE fixed_asset_reclassifications (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  fixed_asset_id TEXT NOT NULL,
  investment_entry_id TEXT,
  financial_movement_id TEXT NOT NULL,
  monetary_component_id TEXT NOT NULL,
  base_amount_cents INTEGER NOT NULL CHECK (base_amount_cents > 0),
  nominal_amount_minor INTEGER NOT NULL CHECK (nominal_amount_minor > 0),
  currency_code TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (fixed_asset_id) REFERENCES fixed_assets(id),
  FOREIGN KEY (investment_entry_id) REFERENCES investment_entries(id),
  FOREIGN KEY (financial_movement_id) REFERENCES financial_movements(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_fixed_assets_business
  ON fixed_assets(business_id, status, acquisition_date DESC);
CREATE INDEX idx_fixed_assets_investor
  ON fixed_assets(business_id, investor_id);
CREATE INDEX idx_fixed_asset_reclassifications_entry
  ON fixed_asset_reclassifications(business_id, investment_entry_id);

ALTER TABLE investment_valuation_snapshots
  ADD COLUMN fixed_assets_cents INTEGER NOT NULL DEFAULT 0;
