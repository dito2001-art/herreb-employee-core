import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryTenantKnowledgeRepository } from "./knowledge-repository";
import { onboardTenantKnowledge } from "./knowledge-onboarding";
import { buildTenantMarketingBrainFromRepository } from "./marketing-brain-repository";

const canonical = (tenantId: string, id: string) => ({
  id,
  tenantId,
  namespace: "marketing",
  kind: "CANONICAL" as const,
  subject: `offering:${id}`,
  content: { statement: `${tenantId}:${id}` },
  sourceRefs: ["tenant-onboarding"],
  confidence: 1,
  verified: true,
  updatedAt: "2026-09-15T18:00:00Z"
});

test("builds EMP003 marketing brain from onboarded tenant knowledge", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();
  await onboardTenantKnowledge(repository, {
    tenantId: "herreb-client-0",
    knowledge: [canonical("herreb-client-0", "service-truth")]
  });

  const brain = await buildTenantMarketingBrainFromRepository(repository, {
    tenantId: "herreb-client-0",
    namespace: "marketing",
    offerings: [
      {
        id: "consulting",
        tenantId: "herreb-client-0",
        type: "SERVICE",
        name: "AI Consulting",
        active: true
      }
    ],
    claims: [
      {
        id: "claim-1",
        tenantId: "herreb-client-0",
        offeringId: "consulting",
        statement: "HerreB offers AI Consulting",
        sourceKnowledgeIds: ["service-truth"],
        verified: true,
        updatedAt: "2026-09-15T18:00:00Z"
      }
    ]
  });

  assert.equal(brain.tenantId, "herreb-client-0");
  assert.deepEqual(brain.knowledge.map((item) => item.id), ["service-truth"]);
  assert.deepEqual(brain.publishableClaims.map((item) => item.id), ["claim-1"]);
});

test("repository-backed brain never loads another tenant knowledge", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();
  await onboardTenantKnowledge(repository, {
    tenantId: "tenant-a",
    knowledge: [canonical("tenant-a", "a")]
  });
  await onboardTenantKnowledge(repository, {
    tenantId: "tenant-b",
    knowledge: [canonical("tenant-b", "b")]
  });

  const brain = await buildTenantMarketingBrainFromRepository(repository, {
    tenantId: "tenant-a",
    namespace: "marketing"
  });

  assert.deepEqual(brain.knowledge.map((item) => item.id), ["a"]);
});
