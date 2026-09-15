import { z } from "zod";
import type { Offering } from "./contracts";
import {
  KnowledgeRecordSchema,
  assertKnowledgeTenant,
  type KnowledgeRecord
} from "./knowledge";
import type { TenantKnowledgeRepository } from "./knowledge-repository";

const TenantKnowledgeOnboardingSchema = z.object({
  tenantId: z.string().min(1),
  knowledge: z.array(KnowledgeRecordSchema).default([])
});

export interface TenantKnowledgeOnboardingInput {
  tenantId: string;
  knowledge?: readonly KnowledgeRecord[];
}

export interface TenantKnowledgeOnboardingResult {
  tenantId: string;
  storedKnowledgeIds: string[];
}

export async function onboardTenantKnowledge(
  repository: TenantKnowledgeRepository,
  input: TenantKnowledgeOnboardingInput
): Promise<TenantKnowledgeOnboardingResult> {
  const parsed = TenantKnowledgeOnboardingSchema.parse(input);

  for (const record of parsed.knowledge) {
    assertKnowledgeTenant(parsed.tenantId, record);
  }

  const storedKnowledgeIds: string[] = [];
  for (const record of parsed.knowledge) {
    await repository.put(parsed.tenantId, record);
    storedKnowledgeIds.push(record.id);
  }

  return { tenantId: parsed.tenantId, storedKnowledgeIds };
}

export function assertTenantOfferings(
  tenantId: string,
  offerings: readonly Offering[]
): void {
  for (const offering of offerings) {
    if (offering.tenantId !== tenantId) {
      throw new Error("OFFERING_TENANT_ISOLATION_VIOLATION");
    }
  }
}
