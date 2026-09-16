import type { Offering } from "./contracts";
import {
  KnowledgeRecordSchema,
  assertKnowledgeTenant,
  canUseAsVerifiedClaim,
  type KnowledgeRecord
} from "./knowledge";
import type { TenantKnowledgeRepository } from "./knowledge-repository";
import {
  assertOfferingTenant,
  type TenantOfferingRepository
} from "./offering-repository";

export interface SqlStorageLike {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): Iterable<T>;
}

const parseJson = <T>(value: unknown): T => JSON.parse(String(value)) as T;

export function initializeMarketingStorage(sql: SqlStorageLike): void {
  sql.exec("CREATE TABLE IF NOT EXISTS emp003_knowledge (tenant_id TEXT NOT NULL, id TEXT NOT NULL, namespace TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id))");
  sql.exec("CREATE INDEX IF NOT EXISTS emp003_knowledge_tenant_namespace ON emp003_knowledge (tenant_id, namespace)");
  sql.exec("CREATE TABLE IF NOT EXISTS emp003_offerings (tenant_id TEXT NOT NULL, id TEXT NOT NULL, active INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id))");
  sql.exec("CREATE INDEX IF NOT EXISTS emp003_offerings_tenant_active ON emp003_offerings (tenant_id, active)");
}

export function createSqliteTenantKnowledgeRepository(sql: SqlStorageLike): TenantKnowledgeRepository {
  initializeMarketingStorage(sql);
  const listForTenant = (tenantId: string, namespace?: string): KnowledgeRecord[] => {
    const rows = namespace
      ? sql.exec<{ payload: string }>("SELECT payload FROM emp003_knowledge WHERE tenant_id = ? AND namespace = ? ORDER BY id", tenantId, namespace)
      : sql.exec<{ payload: string }>("SELECT payload FROM emp003_knowledge WHERE tenant_id = ? ORDER BY id", tenantId);
    return [...rows].map((row) => KnowledgeRecordSchema.parse(parseJson(row.payload)));
  };
  return {
    async list(tenantId, namespace) { return listForTenant(tenantId, namespace); },
    async listVerifiedCanonical(tenantId, namespace) { return listForTenant(tenantId, namespace).filter(canUseAsVerifiedClaim); },
    async get(tenantId, id) {
      const row = [...sql.exec<{ payload: string }>("SELECT payload FROM emp003_knowledge WHERE tenant_id = ? AND id = ? LIMIT 1", tenantId, id)][0];
      return row ? KnowledgeRecordSchema.parse(parseJson(row.payload)) : undefined;
    },
    async put(tenantId, input) {
      const record = KnowledgeRecordSchema.parse(input);
      assertKnowledgeTenant(tenantId, record);
      sql.exec("INSERT INTO emp003_knowledge (tenant_id, id, namespace, payload) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, id) DO UPDATE SET namespace = excluded.namespace, payload = excluded.payload", tenantId, record.id, record.namespace, JSON.stringify(record));
      return record;
    }
  };
}

export function createSqliteTenantOfferingRepository(sql: SqlStorageLike): TenantOfferingRepository {
  initializeMarketingStorage(sql);
  return {
    async list(tenantId, activeOnly = false) {
      const rows = activeOnly
        ? sql.exec<{ payload: string }>("SELECT payload FROM emp003_offerings WHERE tenant_id = ? AND active = 1 ORDER BY id", tenantId)
        : sql.exec<{ payload: string }>("SELECT payload FROM emp003_offerings WHERE tenant_id = ? ORDER BY id", tenantId);
      return [...rows].map((row) => parseJson<Offering>(row.payload));
    },
    async get(tenantId, id) {
      const row = [...sql.exec<{ payload: string }>("SELECT payload FROM emp003_offerings WHERE tenant_id = ? AND id = ? LIMIT 1", tenantId, id)][0];
      return row ? parseJson<Offering>(row.payload) : undefined;
    },
    async put(tenantId, offering) {
      assertOfferingTenant(tenantId, offering);
      sql.exec("INSERT INTO emp003_offerings (tenant_id, id, active, payload) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, id) DO UPDATE SET active = excluded.active, payload = excluded.payload", tenantId, offering.id, offering.active ? 1 : 0, JSON.stringify(offering));
      return offering;
    }
  };
}
