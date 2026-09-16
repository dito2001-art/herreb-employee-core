import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryTenantOfferingRepository } from "./offering-repository";

const offering = (tenantId: string, id: string, active = true) => ({
  id,
  tenantId,
  type: "SERVICE" as const,
  name: `${tenantId}:${id}`,
  active,
  metadata: {}
});

test("offering repository isolates identical ids by tenant", async () => {
  const repository = createInMemoryTenantOfferingRepository();
  await repository.put("tenant-a", offering("tenant-a", "shared"));
  await repository.put("tenant-b", offering("tenant-b", "shared"));

  assert.equal((await repository.get("tenant-a", "shared"))?.name, "tenant-a:shared");
  assert.equal((await repository.get("tenant-b", "shared"))?.name, "tenant-b:shared");
  assert.equal((await repository.list("tenant-a")).length, 1);
});

test("offering repository fails closed before cross-tenant write", async () => {
  const repository = createInMemoryTenantOfferingRepository();
  await assert.rejects(
    repository.put("tenant-a", offering("tenant-b", "forbidden")),
    /OFFERING_TENANT_ISOLATION_VIOLATION/
  );
  assert.equal((await repository.list("tenant-a")).length, 0);
  assert.equal((await repository.list("tenant-b")).length, 0);
});

test("activeOnly excludes inactive tenant offerings", async () => {
  const repository = createInMemoryTenantOfferingRepository();
  await repository.put("tenant-a", offering("tenant-a", "active"));
  await repository.put("tenant-a", offering("tenant-a", "inactive", false));

  assert.deepEqual(
    (await repository.list("tenant-a", true)).map((item) => item.id),
    ["active"]
  );
});
