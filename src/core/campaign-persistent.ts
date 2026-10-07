import { MarketingCampaignSchema, type MarketingCampaign } from "./campaign";

export interface CampaignStorage {
  list(prefix: string): Promise<Array<{ key: string; value: string }>>;
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
}
export interface CampaignRepository {
  list(tenantId:string):Promise<MarketingCampaign[]>;
  get(tenantId:string,campaignId:string):Promise<MarketingCampaign|undefined>;
  put(tenantId:string,campaign:MarketingCampaign):Promise<void>;
}
const prefixFor=(tenantId:string)=>`marketing-campaign:${tenantId}:`;
const keyFor=(tenantId:string,id:string)=>`${prefixFor(tenantId)}${id}`;
function parseCampaign(tenantId:string,raw:string):MarketingCampaign {
  const campaign=MarketingCampaignSchema.parse(JSON.parse(raw));
  if(campaign.tenantId!==tenantId) throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION");
  return campaign;
}
export function createPersistentCampaignRepository(storage:CampaignStorage):CampaignRepository {
 return {
  async list(tenantId){ return (await storage.list(prefixFor(tenantId))).map(x=>parseCampaign(tenantId,x.value)); },
  async get(tenantId,id){ const raw=await storage.get(keyFor(tenantId,id)); return raw?parseCampaign(tenantId,raw):undefined; },
  async put(tenantId,campaign){ if(campaign.tenantId!==tenantId) throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION"); await storage.put(keyFor(tenantId,campaign.id),JSON.stringify(MarketingCampaignSchema.parse(campaign))); }
 };
}
