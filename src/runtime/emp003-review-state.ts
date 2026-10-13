import { z } from "zod";
import { CampaignStateSchema, CampaignTransitionSchema, authorizeCampaignTransition } from "../core/marketing-campaign-lifecycle";

export const EMP003ReviewStateSchema = z.object({
  tenantId: z.string().min(1),
  campaignId: z.string().min(1),
  state: CampaignStateSchema,
  revision: z.number().int().nonnegative(),
  lastCorrelationId: z.string().min(1).nullable(),
  publishExecuted: z.literal(false),
});
export type EMP003ReviewState = z.infer<typeof EMP003ReviewStateSchema>;

export function initialEMP003ReviewState(tenantId: string, campaignId: string): EMP003ReviewState {
  return EMP003ReviewStateSchema.parse({ tenantId, campaignId, state: "DRAFT", revision: 0, lastCorrelationId: null, publishExecuted: false });
}

export function advanceEMP003ReviewState(currentRaw: unknown, transitionRaw: unknown): EMP003ReviewState {
  const current = EMP003ReviewStateSchema.parse(currentRaw);
  const transition = CampaignTransitionSchema.parse(transitionRaw);
  authorizeCampaignTransition(transition, current.tenantId);
  if (transition.campaignId !== current.campaignId) throw new Error("EMP003_REVIEW_CAMPAIGN_MISMATCH");
  if (transition.from !== current.state) throw new Error("EMP003_REVIEW_STALE_STATE");
  return EMP003ReviewStateSchema.parse({
    ...current, state: transition.to, revision: current.revision + 1, lastCorrelationId: transition.correlationId,
  });
}
