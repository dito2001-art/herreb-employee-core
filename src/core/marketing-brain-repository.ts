import type { Offering } from "./contracts";
import type { TenantKnowledgeRepository } from "./knowledge-repository";
import type {
  Audience,
  BrandProfile,
  MarketingClaim,
  MarketingInsight
} from "./marketing";
import {
  buildTenantMarketingBrain,
  type TenantMarketingBrain
} from "./marketing-brain";

export interface RepositoryMarketingBrainInput {
  tenantId: string;
  brand?: BrandProfile;
  audiences?: readonly Audience[];
  offerings?: readonly Offering[];
  claims?: readonly MarketingClaim[];
  insights?: readonly MarketingInsight[];
  namespace?: string;
}

export async function buildTenantMarketingBrainFromRepository(
  repository: TenantKnowledgeRepository,
  input: RepositoryMarketingBrainInput
): Promise<TenantMarketingBrain> {
  const knowledge = await repository.list(input.tenantId, input.namespace);

  return buildTenantMarketingBrain({
    tenantId: input.tenantId,
    brand: input.brand,
    audiences: input.audiences,
    offerings: input.offerings,
    claims: input.claims,
    insights: input.insights,
    knowledge
  });
}
