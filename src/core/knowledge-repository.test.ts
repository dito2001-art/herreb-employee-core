import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryTenantKnowledgeRepository } from "./knowledge-repository";

const record = (tenantId: string, id: string, namespace = "marketing") => ({
  id,
  tenantId,
  namespace,
  kind: "CANONICAL" as const,
  subject: `offering:${id}`,
  content: { statement: `${tenantId}:${id}` },
  sourceRefs: ["onboarding"],
  confidence: 1,
  verified: true,
  updatedAt: "2026-09-15T18:00:00Z"
});

test("knowledge repository isolates records by tenant", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();
  await repository.put("tenant-a", record("tenant-a", "same-id"));
  await repository.put("tenant-b", record("tenant-b", "same-id"));

  assert.equal((await repository.get("tenant-a", "same-id"))?.tenantId, "tenant-a");
  assert.equal((await repository.get("tenant-b", "same-id"))?.tenantId, "tenant-b");
  assert.deepEqual((await repository.list("tenant-a")).map((item) => item.tenantId), ["tenant-a"]);
});

test("knowledge repository fails closed on cross-tenant writes", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();
  await assert.rejects(repository.put("tenant-a", record("tenant-b", "forbidden")), /TENANT_ISOLATION/);
  assert.equal((await repository.list("tenant-a")).length, 0);
  assert.equal((await repository.list("tenant-b")).length, 0);
});

test("knowledge repository scopes namespace queries inside tenant", async () => {
  const repository = createInMemoryTenantKnowledgeRepository();
  await repository.put("tenant-a", record("tenant-a", "mkt", "marketing"));
  await repository.put("tenant-a", record("tenant-a", "sales", "sales"));
  assert.deepEqual((await repository.list("tenant-a", "marketing")).map((item) => item.id), ["mkt"]);
});
