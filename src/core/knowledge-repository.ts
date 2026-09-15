import { KnowledgeRecordSchema, assertKnowledgeTenant, type KnowledgeRecord } from "./knowledge";

export interface TenantKnowledgeRepository {
  list(tenantId: string, namespace?: string): Promise<KnowledgeRecord[]>;
  get(tenantId: string, id: string): Promise<KnowledgeRecord | undefined>;
  put(tenantId: string, record: KnowledgeRecord): Promise<KnowledgeRecord>;
}

export function createInMemoryTenantKnowledgeRepository(): TenantKnowledgeRepository {
  const records = new Map<string, KnowledgeRecord>();
  const key = (tenantId: string, id: string) => `${tenantId}\u0000${id}`;

  return {
    async list(tenantId, namespace) {
      return [...records.values()].filter(
        (record) => record.tenantId === tenantId && (!namespace || record.namespace === namespace)
      );
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
