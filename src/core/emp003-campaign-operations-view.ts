import type { MarketingCampaignBlueprint } from "./marketing-campaign-blueprint";
import type { CampaignTransition } from "./marketing-campaign-lifecycle";

export interface EMP003CampaignOperation {
  campaignId: string;
  tenantId: string;
  objective: string;
  state: CampaignTransition["to"];
  requiresOwnerReview: boolean;
  publishAuthorized: false;
  publishExecuted: false;
}

/** Tenant-scoped, read-only campaign operations projection. Never infers publication consent. */
export function buildEMP003CampaignOperations(input: {
  tenantId: string;
  campaigns: Array<{ campaignId: string; blueprint: MarketingCampaignBlueprint; reviewState?: CampaignTransition["to"] }>;
}): EMP003CampaignOperation[] {
  if (!input.tenantId.trim()) throw new Error("EMP003_TENANT_REQUIRED");
  const seen = new Set<string>();
  return input.campaigns.map(({ campaignId, blueprint, reviewState }) => {
    if (!campaignId.trim() || blueprint.tenantId !== input.tenantId) throw new Error("EMP003_CAMPAIGN_SCOPE_REJECTED");
    if (seen.has(campaignId)) throw new Error("EMP003_CAMPAIGN_DUPLICATE_ID");
    seen.add(campaignId);
    const state = reviewState ?? "DRAFT";
    return {
      campaignId,
      tenantId: input.tenantId,
      objective: blueprint.objective,
      state,
      requiresOwnerReview: state === "DRAFT" || state === "IN_REVIEW",
      publishAuthorized: false,
      publishExecuted: false
    };
  });
}
