import { z } from "zod";

export const MarketingCampaignBlueprintSchema = z.object({
  tenantId: z.string().min(1),
  correlationId: z.string().min(1),
  // Optional for existing API consumers and stored drafts; the portal collects
  // these fields for new campaigns without a storage migration.
  name: z.string().trim().min(1).max(160).optional(),
  schedule: z
    .object({
      startDate: z.iso.date(),
      endDate: z.iso.date()
    })
    .refine((value) => value.endDate >= value.startDate, {
      message: "La fecha final debe ser igual o posterior al inicio."
    })
    .optional(),
  objective: z.string().min(1),
  audiences: z.array(z.string().min(1)).min(1),
  positioning: z.string().min(1),
  keyMessages: z.array(z.string().min(1)).min(1),
  channels: z
    .array(
      z.object({
        name: z.string().min(1),
        actions: z.array(z.string().min(1)).min(1)
      })
    )
    .min(1),
  kpis: z
    .array(
      z.object({
        metric: z.string().min(1),
        target: z.string().min(1),
        measurement: z.string().min(1)
      })
    )
    .min(1),
  assumptions: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().url().startsWith("https://")).min(1),
  status: z.literal("DRAFT"),
  publishApproved: z.literal(false)
});
export type MarketingCampaignBlueprint = z.infer<
  typeof MarketingCampaignBlueprintSchema
>;
export type MarketingCampaignBlueprintInput = Omit<
  MarketingCampaignBlueprint,
  "status" | "publishApproved"
>;

export function createMarketingCampaignBlueprint(
  input: MarketingCampaignBlueprintInput
): MarketingCampaignBlueprint {
  return MarketingCampaignBlueprintSchema.parse({
    ...input,
    status: "DRAFT",
    publishApproved: false
  });
}
