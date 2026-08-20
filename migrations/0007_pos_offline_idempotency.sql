ALTER TABLE sales ADD COLUMN client_operation_id TEXT;

CREATE UNIQUE INDEX idx_sales_client_operation
ON sales (business_id, client_operation_id)
WHERE client_operation_id IS NOT NULL;
