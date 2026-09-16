import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryTenantKnowledgeRepository } from "./knowledge-repository";
import {
  assertTenantOfferings,
  onboardTenantKnowledge
} from "./knowledge-onboarding";

const knowledge = (tenantId: string, id: string) => ({
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

test("onboards knowledge only into the requested tenant", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();
  const result = await onboardTenantKnowledge(repository, {
    tenantId: "tenant-a",
    knowledge: [
      knowledge("tenant-a", "k-1"),
      knowledge("tenant-a", "k-2")
    ]
  });

  assert.deepEqual(result.storedKnowledgeIds, ["k-1", "k-2"]);
  assert.equal((await repository.list("tenant-a")).length, 2);
  assert.equal((await repository.list("tenant-b")).length, 0);
});

test("fails closed before storing any record when onboarding contains another tenant", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();

  await assert.rejects(
    onboardTenantKnowledge(repository, {
      tenantId: "tenant-a",
      knowledge: [
        knowledge("tenant-a", "valid"),
        knowledge("tenant-b", "forbidden")
      ]
    }),
    /TENANT_ISOLATION/
  );

  assert.equal((await repository.list("tenant-a")).length, 0);
  assert.equal((await repository.list("tenant-b")).length, 0);
});

test("offerings used during onboarding must belong to the same tenant", () => {
  assert.throws(
    () =>
      assertTenantOfferings("tenant-a", [
        {
          id: "offering-b",
          tenantId: "tenant-b",
          type: "SERVICE",
          name: "Forbidden service",
          active: true,
          metadata: {}
        }
      ]),
    /OFFERING_TENANT_ISOLATION/
  );
});
