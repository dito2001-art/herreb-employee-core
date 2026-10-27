-- Candidate only. Apply exclusively to an approved isolated copy of the Sales Ops schema.
-- Backfill fails closed if existing quotes already have multiple orders. Do not suppress errors.
CREATE TABLE order_create_operations (
  tenant_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, operation_id),
  UNIQUE (tenant_id, quote_id),
  UNIQUE (tenant_id, order_id)
);
INSERT INTO order_create_operations(tenant_id,operation_id,quote_id,order_id)
SELECT tenant_id, 'legacy:' || id, quote_id, id FROM orders WHERE quote_id IS NOT NULL;
CREATE TRIGGER sales_ops_order_stock_guard BEFORE INSERT ON order_lines
BEGIN
  SELECT CASE WHEN NEW.qty <= 0 OR NOT EXISTS (
    SELECT 1 FROM products WHERE tenant_id=NEW.tenant_id AND sku=NEW.sku AND active=1 AND stock_qty>=NEW.qty
  ) THEN RAISE(ABORT, 'INSUFFICIENT_STOCK') END;
END;
