import {
  KnowledgeRecordSchema,
  assertKnowledgeTenant,
  canUseAsVerifiedClaim,
  type KnowledgeRecord
} from "./knowledge";

export interface TenantKnowledgeRepository {
  list(tenantId: string, namespace?: string): Promise<KnowledgeRecord[]>;
  listVerifiedCanonical(
    tenantId: string,
    namespace?: string
  ): Promise<KnowledgeRecord[]>;
  get(tenantId: string, id: string): Promise<KnowledgeRecord | undefined>;
  put(tenantId: string, record: KnowledgeRecord): Promise<KnowledgeRecord>;
}

export function createInMemoryTenantKnowledgeRepository(): TenantKnowledgeRepository {
  const records = new Map<string, KnowledgeRecord>();
  const key = (tenantId: string, id: string) => `${tenantId}:${id}`;

  const listForTenant = (tenantId: string, namespace?: string) =>
    [...records.values()].filter(
      (record) =>
        record.tenantId === tenantId &&
        (!namespace || record.namespace === namespace)
    );

  return {
    async list(tenantId, namespace) {
      return listForTenant(tenantId, namespace);
    },
    async listVerifiedCanonical(tenantId, namespace) {
      return listForTenant(tenantId, namespace).filter(canUseAsVerifiedClaim);
    },
    async get(tenantId, id) {
      return records.get(key(tenantId, id));
    },
    async put(tenantId, input) {
      const record = KnowledgeRecordSchema.parse(input);
      assertKnowledgeTenant(tenantId, record);
      records.set(key(tenantId, record.id), record);
      return record;
    }
  };
}
