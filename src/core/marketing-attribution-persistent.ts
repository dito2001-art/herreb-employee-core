import type { MarketingLeadHandoff } from "./marketing-handoff";

export interface MarketingAttributionRecord {
  id: string;
  tenantId: string;
  campaignId: string;
  leadId: string;
  evidenceRefs: string[];
  correlationId: string;
  createdAt: string;
}

export interface MarketingAttributionStorage {
  list(prefix:string):Promise<Array<{key:string;value:string}>>;
  get(key:string):Promise<string|undefined>;
  put(key:string,value:string):Promise<void>;
}

export interface MarketingAttributionRepository {
  list(tenantId:string):Promise<MarketingAttributionRecord[]>;
  get(tenantId:string,id:string):Promise<MarketingAttributionRecord|undefined>;
  put(tenantId:string,record:MarketingAttributionRecord):Promise<void>;
}

const prefixFor=(tenantId:string)=>`marketing-attribution:${tenantId}:`;
const keyFor=(tenantId:string,id:string)=>`${prefixFor(tenantId)}${id}`;

function parseRecord(tenantId:string,raw:string):MarketingAttributionRecord {
  const record=JSON.parse(raw) as MarketingAttributionRecord;
  if(!record?.id || record.tenantId!==tenantId) throw new Error("MARKETING_ATTRIBUTION_TENANT_MISMATCH");
  return record;
}

export function createPersistentMarketingAttributionRepository(storage:MarketingAttributionStorage):MarketingAttributionRepository {
 return {
  async list(tenantId){return (await storage.list(prefixFor(tenantId))).map(x=>parseRecord(tenantId,x.value));},
  async get(tenantId,id){const raw=await storage.get(keyFor(tenantId,id));return raw?parseRecord(tenantId,raw):undefined;},
  async put(tenantId,record){
   if(record.tenantId!==tenantId) throw new Error("MARKETING_ATTRIBUTION_TENANT_MISMATCH");
   const key=keyFor(tenantId,record.id); const existing=await storage.get(key);
   if(existing){
    const parsed=parseRecord(tenantId,existing);
    if(parsed.leadId!==record.leadId || parsed.campaignId!==record.campaignId) throw new Error("MARKETING_ATTRIBUTION_IDEMPOTENCY_CONFLICT");
    return;
   }
   await storage.put(key,JSON.stringify(record));
  }
 };
}

export function attributionFromHandoff(handoff:MarketingLeadHandoff,input:{signalId:string;correlationId:string;createdAt:string}):MarketingAttributionRecord {
 if(handoff.evidenceRefs.length===0) throw new Error("MARKETING_ATTRIBUTION_EVIDENCE_REQUIRED");
 return {id:`${handoff.campaignId}:${input.signalId}`,tenantId:handoff.tenantId,campaignId:handoff.campaignId,leadId:handoff.lead.id,evidenceRefs:[...handoff.evidenceRefs],correlationId:input.correlationId,createdAt:input.createdAt};
}
