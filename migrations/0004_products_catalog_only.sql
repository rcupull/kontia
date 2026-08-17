-- Desde esta migración, products es exclusivamente el catálogo.
-- Precio, costo y existencias pertenecen a inventory_batches.
ALTER TABLE products DROP COLUMN sale_price_cents;
ALTER TABLE products DROP COLUMN current_stock;
ALTER TABLE products DROP COLUMN low_stock_threshold;
