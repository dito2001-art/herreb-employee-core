import { z } from "zod";
import { MarketingCampaignBlueprintSchema } from "./marketing-campaign-blueprint";

/** Pure, deny-by-default campaign state transitions. No publishing side effects. */
export const CampaignStateSchema = z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"]);
export const CampaignTransitionSchema = z.object({
  tenantId: z.string().min(1),
  campaignId: z.string().min(1),
  correlationId: z.string().min(1),
  actorId: z.string().min(1),
  actorRole: z.enum(["owner", "reviewer", "operator"]),
  from: CampaignStateSchema,
  to: CampaignStateSchema,
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1)
});
export type CampaignTransition = z.infer<typeof CampaignTransitionSchema>;

export function authorizeCampaignTransition(raw: unknown, campaignTenantId: string): CampaignTransition {
  const transition = CampaignTransitionSchema.parse(raw);
  if (transition.tenantId !== campaignTenantId) throw new Error("EMP003_TENANT_SCOPE_REJECTED");
  const allowed =
    (transition.from === "DRAFT" && transition.to === "IN_REVIEW" && ["owner", "operator"].includes(transition.actorRole)) ||
    (transition.from === "IN_REVIEW" && transition.to === "APPROVED" && transition.actorRole === "owner") ||
    (transition.from === "IN_REVIEW" && transition.to === "REJECTED" && transition.actorRole === "owner") ||
    (transition.from === "REJECTED" && transition.to === "DRAFT" && ["owner", "operator"].includes(transition.actorRole));
  if (!allowed) throw new Error("EMP003_CAMPAIGN_TRANSITION_DENIED");
  return transition;
}

export function createCampaignAuditRecord(raw: unknown, campaignTenantId: string, occurredAt: string) {
  const transition = authorizeCampaignTransition(raw, campaignTenantId);
  if (!Number.isFinite(Date.parse(occurredAt))) throw new Error("EMP003_AUDIT_TIMESTAMP_INVALID");
  return Object.freeze({ ...transition, occurredAt, eventType: "EMP003_CAMPAIGN_STATE_TRANSITION" as const, publishExecuted: false as const });
}

/** Validates generated blueprints before any future persistence or review. */
export function validateCampaignForReview(raw: unknown, tenantId: string) {
  const blueprint = MarketingCampaignBlueprintSchema.parse(raw);
  if (blueprint.tenantId !== tenantId || blueprint.status !== "DRAFT" || blueprint.publishApproved !== false) {
    throw new Error("EMP003_CAMPAIGN_REVIEW_SCOPE_REJECTED");
  }
  return blueprint;
}
