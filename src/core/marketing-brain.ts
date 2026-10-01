import type { Offering } from "./contracts";
import {
  assertKnowledgeTenant,
  canUseAsVerifiedClaim,
  type KnowledgeRecord
} from "./knowledge";
import type {
  Audience,
  BrandProfile,
  MarketingClaim,
  MarketingInsight
} from "./marketing";

export interface TenantMarketingBrain {
  tenantId: string;
  brand?: BrandProfile;
  audiences: Audience[];
  offerings: Offering[];
  publishableClaims: MarketingClaim[];
  insights: MarketingInsight[];
  knowledge: KnowledgeRecord[];
}

export interface MarketingBrainInput {
  tenantId: string;
  brand?: BrandProfile;
  audiences?: readonly Audience[];
  offerings?: readonly Offering[];
  claims?: readonly MarketingClaim[];
  insights?: readonly MarketingInsight[];
  knowledge?: readonly KnowledgeRecord[];
}

export function buildTenantMarketingBrain(
  input: MarketingBrainInput
): TenantMarketingBrain {
  const knowledge = [...(input.knowledge ?? [])];
  for (const record of knowledge) assertKnowledgeTenant(input.tenantId, record);
  if (input.brand && input.brand.tenantId !== input.tenantId)
    throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  for (const audience of input.audiences ?? []) {
    if (audience.tenantId !== input.tenantId)
      throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  }
  for (const offering of input.offerings ?? []) {
    if (offering.tenantId !== input.tenantId)
      throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  }
  for (const insight of input.insights ?? []) {
    if (insight.tenantId !== input.tenantId)
      throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  }

  const knowledgeById = new Map(knowledge.map((record) => [record.id, record]));
  const offeringIds = new Set(
    (input.offerings ?? []).map((offering) => offering.id)
  );
  const publishableClaims = (input.claims ?? []).filter((claim) => {
    if (claim.tenantId !== input.tenantId)
      throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
    if (claim.offeringId && !offeringIds.has(claim.offeringId)) return false;
    if (!claim.verified) return false;
    return claim.sourceKnowledgeIds.every((id) => {
      const record = knowledgeById.get(id);
      return record !== undefined && canUseAsVerifiedClaim(record);
    });
  });

  return {
    tenantId: input.tenantId,
    brand: input.brand,
    audiences: [...(input.audiences ?? [])],
    offerings: [...(input.offerings ?? [])],
    publishableClaims,
    insights: [...(input.insights ?? [])],
    knowledge
  };
}
