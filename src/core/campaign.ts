import { z } from "zod";

export const MarketingObjectiveSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), name: z.string().min(1),
  outcome: z.string().min(1), targetMetric: z.string().min(1), targetValue: z.number().nonnegative(),
  startsAt: z.string().min(1), endsAt: z.string().min(1)
});
export type MarketingObjective = z.infer<typeof MarketingObjectiveSchema>;

export const CampaignStatusSchema = z.enum(["DRAFT","PLANNED","APPROVED","SCHEDULED","ACTIVE","PAUSED","COMPLETED","CANCELLED"]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignActionSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), campaignId: z.string().min(1),
  channel: z.string().min(1), kind: z.string().min(1), status: z.enum(["DRAFT","READY","SCHEDULED","EXECUTED","FAILED","CANCELLED"]).default("DRAFT"),
  scheduledAt: z.string().min(1).optional(), idempotencyKey: z.string().min(1), correlationId: z.string().min(1)
});
export type CampaignAction = z.infer<typeof CampaignActionSchema>;

export const CampaignResultSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), campaignId: z.string().min(1),
  actionId: z.string().min(1).optional(), metric: z.string().min(1), value: z.number(),
  recordedAt: z.string().min(1), evidenceRefs: z.array(z.string().min(1)).default([])
});
export type CampaignResult = z.infer<typeof CampaignResultSchema>;

export const MarketingCampaignSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), objectiveId: z.string().min(1),
  name: z.string().min(1), audienceIds: z.array(z.string().min(1)).default([]),
  offeringIds: z.array(z.string().min(1)).default([]), status: CampaignStatusSchema.default("DRAFT"),
  budget: z.number().nonnegative().optional(), currency: z.string().min(1).optional(),
  startsAt: z.string().min(1), endsAt: z.string().min(1), actions: z.array(CampaignActionSchema).default([]),
  results: z.array(CampaignResultSchema).default([]), createdAt: z.string().min(1), updatedAt: z.string().min(1)
});
export type MarketingCampaign = z.infer<typeof MarketingCampaignSchema>;

const transitions: Record<CampaignStatus, readonly CampaignStatus[]> = {
  DRAFT:["PLANNED","CANCELLED"], PLANNED:["APPROVED","DRAFT","CANCELLED"], APPROVED:["SCHEDULED","CANCELLED"],
  SCHEDULED:["ACTIVE","PAUSED","CANCELLED"], ACTIVE:["PAUSED","COMPLETED","CANCELLED"],
  PAUSED:["SCHEDULED","ACTIVE","CANCELLED"], COMPLETED:[], CANCELLED:[]
};

export function assertCampaignTenant(tenantId:string, resource:{tenantId:string}):void {
  if (tenantId !== resource.tenantId) throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION");
}
export function transitionCampaign(campaign:MarketingCampaign, next:CampaignStatus, updatedAt:string):MarketingCampaign {
  if (!transitions[campaign.status].includes(next)) throw new Error(`INVALID_CAMPAIGN_TRANSITION:${campaign.status}->${next}`);
  return { ...campaign, status: next, updatedAt };
}
export function addCampaignAction(campaign:MarketingCampaign, action:CampaignAction, updatedAt:string):MarketingCampaign {
  assertCampaignTenant(campaign.tenantId, action);
  if (action.campaignId !== campaign.id) throw new Error("CAMPAIGN_ACTION_PARENT_MISMATCH");
  if (campaign.actions.some(x=>x.id===action.id || x.idempotencyKey===action.idempotencyKey)) return campaign;
  return { ...campaign, actions:[...campaign.actions, action], updatedAt };
}
export function recordCampaignResult(campaign:MarketingCampaign, result:CampaignResult, updatedAt:string):MarketingCampaign {
  assertCampaignTenant(campaign.tenantId, result);
  if (result.campaignId !== campaign.id) throw new Error("CAMPAIGN_RESULT_PARENT_MISMATCH");
  if (result.actionId && !campaign.actions.some(x=>x.id===result.actionId)) throw new Error("CAMPAIGN_RESULT_ACTION_NOT_FOUND");
  if (campaign.results.some(x=>x.id===result.id)) return campaign;
  return { ...campaign, results:[...campaign.results, result], updatedAt };
}
