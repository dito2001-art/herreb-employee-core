import { z } from "zod";
import {
  BrandProfileSchema,
  AudienceSchema,
  MarketingClaimSchema
} from "../core/marketing";
import { KnowledgeRecordSchema } from "../core/knowledge";
import { OfferingSchema } from "../core/contracts";
import { MarketingObjectiveSchema } from "../core/campaign";
import { MarketingCampaignBlueprintSchema } from "../core/marketing-campaign-blueprint";
import { buildTenantMarketingBrain } from "../core/marketing-brain";
import type { ContentGenerator } from "../core/marketing-content-orchestrator";

export const CopyId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const CopyGenerateInput = z
  .object({
    campaignId: CopyId,
    assetId: CopyId,
    operationId: CopyId,
    expectedRevision: z.number().int().min(0),
    campaignRevision: z.number().int().positive(),
    channel: z.string().trim().min(1).max(100)
  })
  .strict();
export type CopyRequest = z.infer<typeof CopyGenerateInput>;
const bindingSchema = z
  .object({
    campaignId: CopyId,
    campaignRevision: z.number().int().positive(),
    audienceId: CopyId,
    offeringId: CopyId,
    channel: z.string().min(1),
    objective: MarketingObjectiveSchema
  })
  .strict();
export const CopyContextSchema = z
  .object({
    tenantId: CopyId,
    revision: z.number().int().positive(),
    dailyLimit: z.number().int().min(1).max(20),
    brand: BrandProfileSchema,
    audiences: z.array(AudienceSchema),
    offerings: z.array(OfferingSchema),
    knowledge: z.array(KnowledgeRecordSchema),
    claims: z.array(MarketingClaimSchema),
    campaigns: z.array(bindingSchema)
  })
  .strict();
export type CopyContext = z.infer<typeof CopyContextSchema>;

/** Deployment-owned, non-secret configuration. Never accepts client-supplied claims.
 * Missing configuration fails closed; no default brand, claim or target is invented.
 */
export function resolveCopyContext(raw: string | undefined, tenantId: string) {
  if (!raw) throw new Error("COPY_CONTEXT_NOT_CONFIGURED");
  const all = z.array(CopyContextSchema).max(100).parse(JSON.parse(raw));
  if (new Set(all.map((x) => x.tenantId)).size !== all.length)
    throw new Error("COPY_CONTEXT_DUPLICATE_TENANT");
  const context = all.find((x) => x.tenantId === tenantId);
  if (!context) throw new Error("COPY_CONTEXT_NOT_CONFIGURED");
  const brain = buildTenantMarketingBrain(context);
  if (
    brain.publishableClaims.some((claim) =>
      claim.sourceKnowledgeIds.some(
        (id) => !brain.knowledge.find((k) => k.id === id)?.sourceRefs.length
      )
    )
  )
    throw new Error("COPY_VERIFIED_KNOWLEDGE_REQUIRED");
  if (!brain.publishableClaims.length)
    throw new Error("COPY_VERIFIED_KNOWLEDGE_REQUIRED");
  const bindings = context.campaigns.map((x) => `${x.campaignId}:${x.channel}`);
  if (new Set(bindings).size !== bindings.length)
    throw new Error("COPY_CONTEXT_DUPLICATE_CAMPAIGN");
  for (const link of context.campaigns) {
    if (link.objective.tenantId !== tenantId)
      throw new Error("COPY_CONTEXT_SCOPE_REJECTED");
  }
  return { context, brain };
}
export function resolveCopyGeneration(
  raw: string | undefined,
  tenantId: string,
  input: CopyRequest,
  stored: { campaign: unknown; revision: number },
  generator: ContentGenerator
) {
  const { context, brain } = resolveCopyContext(raw, tenantId);
  const blueprint = MarketingCampaignBlueprintSchema.parse(stored.campaign);
  if (blueprint.tenantId !== tenantId)
    throw new Error("COPY_CONTEXT_SCOPE_REJECTED");
  if (stored.revision !== input.campaignRevision)
    throw new Error("COPY_CAMPAIGN_REVISION_CONFLICT");
  const link = context.campaigns.find(
    (x) => x.campaignId === input.campaignId && x.channel === input.channel
  );
  if (!link || link.campaignRevision !== stored.revision)
    throw new Error("COPY_CAMPAIGN_CONTEXT_REQUIRED");
  const audience = brain.audiences.find((x) => x.id === link.audienceId);
  const offering = brain.offerings.find(
    (x) => x.id === link.offeringId && x.active
  );
  if (
    !audience ||
    !offering ||
    !blueprint.audiences.includes(audience.name) ||
    !blueprint.channels.some((x) => x.name === link.channel) ||
    link.objective.outcome !== blueprint.objective ||
    !blueprint.schedule ||
    blueprint.schedule.startDate !== link.objective.startsAt ||
    blueprint.schedule.endDate !== link.objective.endsAt
  )
    throw new Error("COPY_CAMPAIGN_CONTEXT_MISMATCH");
  const campaign = {
    id: input.campaignId,
    tenantId,
    name: blueprint.name ?? blueprint.objective,
    objectiveId: link.objective.id,
    audienceIds: [link.audienceId],
    offeringIds: [link.offeringId],
    status: "DRAFT" as const,
    startsAt: blueprint.schedule.startDate,
    endsAt: blueprint.schedule.endDate,
    actions: [
      {
        id: input.assetId,
        tenantId,
        campaignId: input.campaignId,
        channel: link.channel,
        kind: "CONTENT_PREPARATION",
        status: "DRAFT" as const,
        idempotencyKey: input.operationId,
        correlationId: blueprint.correlationId
      }
    ],
    results: [],
    createdAt: blueprint.schedule.startDate,
    updatedAt: blueprint.schedule.startDate
  };
  return {
    context,
    generation: {
      brain,
      campaign,
      objective: link.objective,
      offeringId: link.offeringId,
      audienceId: link.audienceId,
      channel: link.channel,
      generator
    }
  };
}
