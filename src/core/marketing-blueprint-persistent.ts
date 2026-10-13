import { MarketingCampaignBlueprintSchema, type MarketingCampaignBlueprint } from "./marketing-campaign-blueprint";
import type { CampaignStorage } from "./campaign-persistent";

/** Persistence contract for EMP-003 draft blueprints; no publishing capability. */
export interface BlueprintRepository {
  get(tenantId: string, campaignId: string): Promise<MarketingCampaignBlueprint | undefined>;
  put(tenantId: string, campaignId: string, blueprint: MarketingCampaignBlueprint): Promise<void>;
  list(tenantId: string): Promise<MarketingCampaignBlueprint[]>;
}
function safeId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("EMP003_STORAGE_ID_INVALID");
  return value;
}
const prefix = (tenantId: string) => `emp003:blueprint:${safeId(tenantId)}:`;
const key = (tenantId: string, campaignId: string) => prefix(tenantId) + safeId(campaignId);
function decode(raw: string, tenantId: string): MarketingCampaignBlueprint {
  const blueprint = MarketingCampaignBlueprintSchema.parse(JSON.parse(raw));
  if (blueprint.tenantId !== tenantId) throw new Error("EMP003_STORAGE_TENANT_VIOLATION");
  return blueprint;
}
export function createPersistentBlueprintRepository(storage: CampaignStorage): BlueprintRepository {
  return {
    async get(tenantId, campaignId) {
      const raw = await storage.get(key(tenantId, campaignId));
      return raw === undefined ? undefined : decode(raw, tenantId);
    },
    async put(tenantId, campaignId, blueprint) {
      const validated = MarketingCampaignBlueprintSchema.parse(blueprint);
      if (validated.tenantId !== tenantId) throw new Error("EMP003_STORAGE_TENANT_VIOLATION");
      await storage.put(key(tenantId, campaignId), JSON.stringify(validated));
    },
    async list(tenantId) {
      const records = await storage.list(prefix(tenantId));
      return records.map(({ key: storedKey, value }) => {
        if (!storedKey.startsWith(prefix(tenantId))) throw new Error("EMP003_STORAGE_TENANT_VIOLATION");
        return decode(value, tenantId);
      });
    }
  };
}
