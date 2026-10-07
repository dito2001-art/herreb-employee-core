import type { MarketingCampaign } from "./campaign";
import type { SalesLeadState } from "./sales-state";

export interface MarketingLeadSignal {
  id: string;
  tenantId: string;
  campaignId: string;
  actionId?: string;
  contactKey: string;
  qualified?: boolean;
  evidenceRefs: string[];
}

export interface MarketingLeadHandoff {
  tenantId: string;
  campaignId: string;
  lead: SalesLeadState;
  evidenceRefs: string[];
}

export function createMarketingLeadHandoff(input: {
  campaign: MarketingCampaign;
  signal: MarketingLeadSignal;
}): MarketingLeadHandoff {
  const { campaign, signal } = input;
  if (campaign.tenantId !== signal.tenantId)
    throw new Error("MARKETING_LEAD_TENANT_ISOLATION_VIOLATION");
  if (campaign.id !== signal.campaignId)
    throw new Error("MARKETING_LEAD_CAMPAIGN_MISMATCH");
  if (signal.actionId && !campaign.actions.some((x) => x.id === signal.actionId))
    throw new Error("MARKETING_LEAD_ACTION_NOT_FOUND");
  if (signal.evidenceRefs.length === 0)
    throw new Error("MARKETING_LEAD_EVIDENCE_REQUIRED");

  return {
    tenantId: signal.tenantId,
    campaignId: signal.campaignId,
    evidenceRefs: [...signal.evidenceRefs],
    lead: {
      id: `marketing:${signal.campaignId}:${signal.id}`,
      tenantId: signal.tenantId,
      source: "INBOUND",
      contactKey: signal.contactKey,
      qualified: signal.qualified ?? false,
      contacted: false,
      followupDue: false
    }
  };
}

export interface CampaignMeasurement {
  tenantId: string;
  campaignId: string;
  totals: Record<string, number>;
  evidenceRefs: string[];
}

export function measureCampaign(campaign: MarketingCampaign): CampaignMeasurement {
  const totals: Record<string, number> = {};
  const evidence = new Set<string>();
  for (const result of campaign.results) {
    if (result.tenantId !== campaign.tenantId)
      throw new Error("MARKETING_CAMPAIGN_TENANT_ISOLATION_VIOLATION");
    totals[result.metric] = (totals[result.metric] ?? 0) + result.value;
    for (const ref of result.evidenceRefs) evidence.add(ref);
  }
  return {
    tenantId: campaign.tenantId,
    campaignId: campaign.id,
    totals,
    evidenceRefs: [...evidence]
  };
}
