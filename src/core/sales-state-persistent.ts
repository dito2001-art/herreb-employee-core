import type { SalesLeadState, SalesStateRepository } from "./sales-state";

export interface SalesStateStorage {
  list(prefix: string): Promise<Array<{ key: string; value: string }>>;
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
}

const prefixFor = (tenantId: string) => `sales-state:${tenantId}:`;
const keyFor = (tenantId: string, leadId: string) =>
  `${prefixFor(tenantId)}${leadId}`;

function parseLead(tenantId: string, raw: string): SalesLeadState {
  const lead = JSON.parse(raw) as SalesLeadState;
  if (!lead || lead.tenantId !== tenantId || !lead.id) {
    throw new Error("SALES_STATE_TENANT_MISMATCH");
  }
  return lead;
}

export function createPersistentSalesStateRepository(
  storage: SalesStateStorage
): SalesStateRepository {
  return {
    async list(tenantId) {
      const records = await storage.list(prefixFor(tenantId));
      return records.map((record) => parseLead(tenantId, record.value));
    },
    async get(tenantId, leadId) {
      const raw = await storage.get(keyFor(tenantId, leadId));
      return raw ? parseLead(tenantId, raw) : undefined;
    },
    async put(tenantId, lead) {
      if (lead.tenantId !== tenantId) {
        throw new Error("SALES_STATE_TENANT_MISMATCH");
      }
      await storage.put(keyFor(tenantId, lead.id), JSON.stringify(lead));
    }
  };
}
