import type { MarketingCampaign, CampaignAction } from "./campaign";
import type { DurableDispatcher, DurableJob, DurableDispatchResult } from "./durable";
import type { TenantContext } from "./contracts";

export async function scheduleCampaignAction(input: {
  dispatcher: DurableDispatcher;
  context: TenantContext;
  campaign: MarketingCampaign;
  action: CampaignAction;
  notBefore: string;
}): Promise<DurableDispatchResult> {
  const { context, campaign, action } = input;
  if (context.employeeId !== "EMP-003") throw new Error("EMP003_EXECUTION_CONTEXT_REQUIRED");
  if (campaign.tenantId !== context.tenantId || action.tenantId !== context.tenantId)
    throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION");
  if (action.campaignId !== campaign.id || !campaign.actions.some((x) => x.id === action.id))
    throw new Error("CAMPAIGN_ACTION_LINEAGE_MISMATCH");
  if (campaign.status !== "APPROVED" && campaign.status !== "SCHEDULED" && campaign.status !== "ACTIVE")
    throw new Error("CAMPAIGN_NOT_APPROVED_FOR_EXECUTION");
  if (action.status !== "READY" && action.status !== "SCHEDULED")
    throw new Error("CAMPAIGN_ACTION_NOT_READY");

  const job: DurableJob = {
    jobId: `emp003-campaign:${context.tenantId}:${campaign.id}:${action.id}`,
    context,
    capabilityId: "campaign.schedule",
    payload: { campaignId: campaign.id, actionId: action.id, channel: action.channel, kind: action.kind },
    idempotencyKey: action.idempotencyKey,
    notBefore: input.notBefore,
    requiresApproval: true
  };
  return input.dispatcher.dispatch(job);
}
