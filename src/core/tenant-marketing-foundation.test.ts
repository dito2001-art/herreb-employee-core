import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryTenantKnowledgeRepository } from "./knowledge-repository";
import { createInMemoryTenantOfferingRepository } from "./offering-repository";
import { onboardTenantMarketingFoundation } from "./tenant-marketing-foundation";

const knowledge = (tenantId: string, id: string) => ({
  id,
  tenantId,
  namespace: "marketing",
  kind: "CANONICAL" as const,
  subject: `service:${id}`,
  content: { statement: `truth:${id}` },
  sourceRefs: ["client0-onboarding"],
  confidence: 1,
  verified: true,
  updatedAt: "2026-09-16T00:00:00Z"
});

const offering = (tenantId: string, id: string) => ({
  id,
  tenantId,
  type: "SERVICE" as const,
  name: id,
  active: true,
  metadata: {}
});

test("onboards tenant knowledge and offerings as one validated foundation", async () => {
  const knowledgeRepository = createInMemoryTenantKnowledgeRepository();
  const offeringRepository = createInMemoryTenantOfferingRepository();

  const result = await onboardTenantMarketingFoundation({
    knowledgeRepository,
    offeringRepository,
    foundation: {
      tenantId: "herreb-client-0",
      knowledge: [knowledge("herreb-client-0", "k-consulting")],
      offerings: [offering("herreb-client-0", "ai-consulting")]
    }
  });

  assert.deepEqual(result.storedKnowledgeIds, ["k-consulting"]);
  assert.deepEqual(result.storedOfferingIds, ["ai-consulting"]);
  assert.equal((await knowledgeRepository.list("herreb-client-0")).length, 1);
  assert.equal((await offeringRepository.list("herreb-client-0")).length, 1);
});

test("prevalidation rejects foreign offering before any knowledge write", async () => {
  const knowledgeRepository = createInMemoryTenantKnowledgeRepository();
  const offeringRepository = createInMemoryTenantOfferingRepository();

  await assert.rejects(
    onboardTenantMarketingFoundation({
      knowledgeRepository,
      offeringRepository,
      foundation: {
        tenantId: "herreb-client-0",
        knowledge: [knowledge("herreb-client-0", "k-safe")],
        offerings: [offering("tenant-b", "foreign")]
      }
    }),
    /OFFERING_TENANT_ISOLATION_VIOLATION/
  );

  assert.equal((await knowledgeRepository.list("herreb-client-0")).length, 0);
  assert.equal((await offeringRepository.list("herreb-client-0")).length, 0);
});

test("prevalidation rejects foreign knowledge before any offering write", async () => {
  const knowledgeRepository = createInMemoryTenantKnowledgeRepository();
  const offeringRepository = createInMemoryTenantOfferingRepository();

  await assert.rejects(
    onboardTenantMarketingFoundation({
      knowledgeRepository,
      offeringRepository,
      foundation: {
        tenantId: "herreb-client-0",
        knowledge: [knowledge("tenant-b", "foreign-k")],
        offerings: [offering("herreb-client-0", "safe-offering")]
      }
    }),
    /KNOWLEDGE_TENANT_ISOLATION_VIOLATION/
  );

  assert.equal((await knowledgeRepository.list("herreb-client-0")).length, 0);
  assert.equal((await offeringRepository.list("herreb-client-0")).length, 0);
});
