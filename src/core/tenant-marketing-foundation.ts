import type { Offering } from "./contracts";
import {
  KnowledgeRecordSchema,
  assertKnowledgeTenant,
  type KnowledgeRecord
} from "./knowledge";
import type { TenantKnowledgeRepository } from "./knowledge-repository";
import {
  assertOfferingTenant,
  type TenantOfferingRepository
} from "./offering-repository";

export interface TenantMarketingFoundationInput {
  tenantId: string;
  knowledge?: readonly KnowledgeRecord[];
  offerings?: readonly Offering[];
}

export interface TenantMarketingFoundationResult {
  tenantId: string;
  storedKnowledgeIds: string[];
  storedOfferingIds: string[];
}

/**
 * Pre-validates the complete tenant foundation before performing writes.
 * This prevents tenant-isolation errors from causing partial onboarding.
 * Repository-level failures are not claimed to be transactionally atomic.
 */
export async function onboardTenantMarketingFoundation(input: {
  knowledgeRepository: TenantKnowledgeRepository;
  offeringRepository: TenantOfferingRepository;
  foundation: TenantMarketingFoundationInput;
}): Promise<TenantMarketingFoundationResult> {
  const tenantId = input.foundation.tenantId;
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");

  const knowledge = (input.foundation.knowledge ?? []).map((record) =>
    KnowledgeRecordSchema.parse(record)
  );
  const offerings = input.foundation.offerings ?? [];

  for (const record of knowledge) assertKnowledgeTenant(tenantId, record);
  for (const offering of offerings) assertOfferingTenant(tenantId, offering);

  const storedKnowledgeIds: string[] = [];
  const storedOfferingIds: string[] = [];

  for (const record of knowledge) {
    await input.knowledgeRepository.put(tenantId, record);
    storedKnowledgeIds.push(record.id);
  }
  for (const offering of offerings) {
    const stored = await input.offeringRepository.put(tenantId, offering);
    storedOfferingIds.push(stored.id);
  }

  return { tenantId, storedKnowledgeIds, storedOfferingIds };
}
