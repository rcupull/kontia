CREATE UNIQUE INDEX idx_cash_sessions_open_user_location
ON cash_sessions (business_id, seller_id, location_id)
WHERE status = 'open' AND deleted_at IS NULL;
