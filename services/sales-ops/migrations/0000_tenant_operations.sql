-- PREPARATION ONLY: NOT APPLIED TO CLOUDFLARE.
-- Derived solely from the existing worker's tenant_operations DDL, not the full sandbox schema.
-- Apply only after the authoritative D1 base schema and release gates are certified.
CREATE TABLE IF NOT EXISTS tenant_operations (
  tenant_id TEXT PRIMARY KEY,
  operations_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
