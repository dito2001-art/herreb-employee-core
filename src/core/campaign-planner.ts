import type { TenantMarketingBrain } from "./marketing-brain";
import { MarketingCampaignSchema, MarketingObjectiveSchema, type MarketingCampaign, type MarketingObjective } from "./campaign";

export interface CampaignPlanInput {
 tenantId:string; objective:MarketingObjective; campaignId:string; name:string;
 audienceIds:string[]; offeringIds:string[]; startsAt:string; endsAt:string; createdAt:string;
 correlationId:string; channels:string[];
}
export function planCampaign(brain:TenantMarketingBrain,input:CampaignPlanInput):MarketingCampaign {
 if(brain.tenantId!==input.tenantId) throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION");
 MarketingObjectiveSchema.parse(input.objective);
 if(input.objective.tenantId!==input.tenantId) throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION");
 const audienceIds=new Set(brain.audiences.map(x=>x.id));
 const offeringIds=new Set(brain.offerings.map(x=>x.id));
 for(const id of input.audienceIds) if(!audienceIds.has(id)) throw new Error(`CAMPAIGN_AUDIENCE_NOT_FOUND:${id}`);
 for(const id of input.offeringIds) if(!offeringIds.has(id)) throw new Error(`CAMPAIGN_OFFERING_NOT_FOUND:${id}`);
 if(input.channels.length===0) throw new Error("CAMPAIGN_CHANNEL_REQUIRED");
 const actions=input.channels.map((channel,index)=>({
   id:`${input.campaignId}:action:${index+1}`,tenantId:input.tenantId,campaignId:input.campaignId,
   channel,kind:"CONTENT_PREPARATION",status:"DRAFT" as const,
   idempotencyKey:`${input.campaignId}:${channel}:${index+1}`,correlationId:input.correlationId
 }));
 return MarketingCampaignSchema.parse({
  id:input.campaignId,tenantId:input.tenantId,objectiveId:input.objective.id,name:input.name,
  audienceIds:input.audienceIds,offeringIds:input.offeringIds,status:"PLANNED",startsAt:input.startsAt,endsAt:input.endsAt,
  actions,results:[],createdAt:input.createdAt,updatedAt:input.createdAt
 });
}
