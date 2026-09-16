import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryTenantKnowledgeRepository } from "./knowledge-repository";
import { createInMemoryTenantOfferingRepository } from "./offering-repository";
import { loadTenantMarketingBrain } from "./marketing-brain-repository";

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
  updatedAt: "2026-09-16T00:00:00Z"
});

const offering = (tenantId: string, id: string, name: string, active = true) => ({
  id,
  tenantId,
  type: "SERVICE" as const,
  name,
  active,
  metadata: {}
});

test("EMP003 loads active tenant offerings and knowledge without EMP001 state", async () => {
  const knowledgeRepository = createInMemoryTenantKnowledgeRepository();
  const offeringRepository = createInMemoryTenantOfferingRepository();
  await knowledgeRepository.put("tenant-a", canonical("tenant-a", "k-1"));
  await offeringRepository.put("tenant-a", offering("tenant-a", "service-a", "Consulting"));
  await offeringRepository.put("tenant-a", offering("tenant-a", "old-service", "Old", false));
  await offeringRepository.put("tenant-b", offering("tenant-b", "service-b", "Forbidden"));

  const brain = await loadTenantMarketingBrain({ tenantId: "tenant-a", knowledgeRepository, offeringRepository });
  assert.equal(brain.tenantId, "tenant-a");
  assert.deepEqual(brain.offerings.map((item) => item.id), ["service-a"]);
  assert.deepEqual(brain.knowledge.map((item) => item.id), ["k-1"]);
});

test("repository-backed brain publishes only claims grounded in verified tenant truth", async () => {
  const knowledgeRepository = createInMemoryTenantKnowledgeRepository();
  const offeringRepository = createInMemoryTenantOfferingRepository();
  await knowledgeRepository.put("tenant-a", canonical("tenant-a", "k-verified"));
  await offeringRepository.put("tenant-a", offering("tenant-a", "service-a", "Consulting"));

  const brain = await loadTenantMarketingBrain({
    tenantId: "tenant-a",
    knowledgeRepository,
    offeringRepository,
    marketingRepository: {
      async getBrand() {
        return undefined;
      },
      async listAudiences() {
        return [];
      },
      async listInsights() {
        return [];
      },
      async listClaims() {
        return [
          {
            id: "claim-1",
            tenantId: "tenant-a",
            offeringId: "service-a",
            text: "Verified claim",
            sourceKnowledgeIds: ["k-verified"],
            verified: true
          }
        ];
      }
    }
  });

  assert.deepEqual(brain.publishableClaims.map((claim) => claim.id), ["claim-1"]);
});
