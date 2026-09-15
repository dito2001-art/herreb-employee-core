import { z } from "zod";

export const BrandProfileSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  positioning: z.string().optional(),
  voice: z.array(z.string().min(1)).default([]),
  prohibitedThemes: z.array(z.string().min(1)).default([])
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export const AudienceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  needs: z.array(z.string().min(1)).default([]),
  channels: z.array(z.string().min(1)).default([])
});
export type Audience = z.infer<typeof AudienceSchema>;

export const MarketingClaimSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  offeringId: z.string().min(1).optional(),
  text: z.string().min(1),
  sourceKnowledgeIds: z.array(z.string().min(1)).min(1),
  verified: z.boolean().default(false)
});
export type MarketingClaim = z.infer<typeof MarketingClaimSchema>;

export const MarketingInsightSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  audienceId: z.string().min(1).optional(),
  hypothesis: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  learnedAt: z.string().min(1)
});
export type MarketingInsight = z.infer<typeof MarketingInsightSchema>;

export function assertMarketingTenant(
  expectedTenantId: string,
  actualTenantId: string
): void {
  if (expectedTenantId !== actualTenantId) {
    throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  }
}

export function canPublishClaim(claim: MarketingClaim): boolean {
  return claim.verified && claim.sourceKnowledgeIds.length > 0;
}
