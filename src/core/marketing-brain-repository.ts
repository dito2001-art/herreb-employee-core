import type { Audience, BrandProfile, MarketingClaim, MarketingInsight } from "./marketing";
import { buildTenantMarketingBrain, type TenantMarketingBrain } from "./marketing-brain";
import type { TenantKnowledgeRepository } from "./knowledge-repository";
import type { TenantOfferingRepository } from "./offering-repository";

export interface TenantMarketingProfileRepository {
  getBrand(tenantId: string): Promise<BrandProfile | undefined>;
  listAudiences(tenantId: string): Promise<Audience[]>;
  listClaims(tenantId: string): Promise<MarketingClaim[]>;
  listInsights(tenantId: string): Promise<MarketingInsight[]>;
}

export async function loadTenantMarketingBrain(input: {
  tenantId: string;
  knowledgeRepository: TenantKnowledgeRepository;
  offeringRepository: TenantOfferingRepository;
  marketingRepository?: TenantMarketingProfileRepository;
}): Promise<TenantMarketingBrain> {
  const [knowledge, offerings, brand, audiences, claims, insights] = await Promise.all([
    input.knowledgeRepository.list(input.tenantId),
    input.offeringRepository.list(input.tenantId, true),
    input.marketingRepository?.getBrand(input.tenantId),
    input.marketingRepository?.listAudiences(input.tenantId) ?? Promise.resolve([]),
    input.marketingRepository?.listClaims(input.tenantId) ?? Promise.resolve([]),
    input.marketingRepository?.listInsights(input.tenantId) ?? Promise.resolve([])
  ]);

  return buildTenantMarketingBrain({
    tenantId: input.tenantId,
    brand,
    audiences,
    offerings,
    claims,
    insights,
    knowledge
  });
}
