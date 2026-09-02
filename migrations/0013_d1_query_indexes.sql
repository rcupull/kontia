-- Supports the business-scoped sales history query and its LIMIT 500 ordering.
-- Existing idx_sales_session cannot provide this order because cash_session_id
-- appears between business_id and created_at.
CREATE INDEX idx_sales_business_history
  ON sales(business_id, deleted_at, created_at DESC, id DESC);
