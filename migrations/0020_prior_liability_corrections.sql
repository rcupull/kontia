PRAGMA foreign_keys = ON;

CREATE TABLE investment_prior_liability_corrections (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  investor_id TEXT NOT NULL,
  source_investment_entry_id TEXT NOT NULL,
  correction_investment_entry_id TEXT NOT NULL UNIQUE,
  supplier_invoice_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  units_burned_micros INTEGER NOT NULL CHECK (units_burned_micros > 0),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (investor_id) REFERENCES investors(id),
  FOREIGN KEY (source_investment_entry_id) REFERENCES investment_entries(id),
  FOREIGN KEY (correction_investment_entry_id) REFERENCES investment_entries(id),
  FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE investment_prior_liability_payment_components (
  correction_id TEXT NOT NULL,
  monetary_component_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (correction_id, monetary_component_id),
  FOREIGN KEY (correction_id) REFERENCES investment_prior_liability_corrections(id),
  FOREIGN KEY (monetary_component_id) REFERENCES monetary_components(id)
);

CREATE INDEX idx_prior_liability_corrections_business
  ON investment_prior_liability_corrections(business_id, created_at DESC);
CREATE INDEX idx_prior_liability_corrections_source
  ON investment_prior_liability_corrections(business_id, source_investment_entry_id);
