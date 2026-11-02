import { z } from "zod";
import { MarketingCampaignBlueprintSchema } from "./marketing-campaign-blueprint";
import { CampaignStateSchema } from "./marketing-campaign-lifecycle";

export const EMP003CampaignOperationsResponseSchema = z.object({
  ok: z.literal(true),
  tenantId: z.string().min(1),
  campaigns: z.array(
    z.object({
      campaignId: z.string().min(1),
      blueprint: MarketingCampaignBlueprintSchema,
      reviewState: CampaignStateSchema,
      reviewRevision: z.number().int().nonnegative(),
      requiresOwnerReview: z.boolean(),
      publishAuthorized: z.literal(false),
      publishExecuted: z.literal(false)
    })
  )
});

export type EMP003CampaignReviewCard = {
  campaignId: string;
  name?: string;
  objective: string;
  reviewState: z.infer<typeof CampaignStateSchema>;
  revision: number;
  channels: string[];
  audienceCount: number;
  evidenceCount: number;
  requiresOwnerReview: boolean;
  canSubmitForReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  publishAuthorized: false;
  publishExecuted: false;
};

/** Validated view model for an eventual owner UI. No auth, write, or publish side effects. */
export function buildEMP003ReviewCards(
  raw: unknown,
  expectedTenantId: string
): EMP003CampaignReviewCard[] {
  if (!expectedTenantId.trim())
    throw new Error("EMP003_REVIEW_UI_TENANT_REQUIRED");
  const parsed = EMP003CampaignOperationsResponseSchema.parse(raw);
  if (parsed.tenantId !== expectedTenantId)
    throw new Error("EMP003_REVIEW_UI_TENANT_MISMATCH");
  const seen = new Set<string>();
  return parsed.campaigns.map((item) => {
    if (item.blueprint.tenantId !== expectedTenantId)
      throw new Error("EMP003_REVIEW_UI_CAMPAIGN_SCOPE_REJECTED");
    if (seen.has(item.campaignId))
      throw new Error("EMP003_REVIEW_UI_DUPLICATE_CAMPAIGN");
    seen.add(item.campaignId);
    if (
      item.requiresOwnerReview !==
      (item.reviewState === "DRAFT" || item.reviewState === "IN_REVIEW")
    )
      throw new Error("EMP003_REVIEW_UI_STATE_MISMATCH");
    return {
      campaignId: item.campaignId,
      ...(item.blueprint.name ? { name: item.blueprint.name } : {}),
      objective: item.blueprint.objective,
      reviewState: item.reviewState,
      revision: item.reviewRevision,
      channels: item.blueprint.channels.map((channel) => channel.name),
      audienceCount: item.blueprint.audiences.length,
      evidenceCount: item.blueprint.evidenceRefs.length,
      requiresOwnerReview: item.requiresOwnerReview,
      canSubmitForReview: item.reviewState === "DRAFT",
      canApprove: item.reviewState === "IN_REVIEW",
      canReject: item.reviewState === "IN_REVIEW",
      publishAuthorized: false,
      publishExecuted: false
    };
  });
}
