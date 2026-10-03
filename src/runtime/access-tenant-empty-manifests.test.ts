import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

test("empty manifest array cannot authorize mapped identity", () => {
  const manifests = parseRuntimeTenantRegistryManifests("[]");
  assert.throws(() => resolveAccessIdentityWithRegistry("owner@test.local", JSON.stringify([{ email: "owner@test.local", tenantId: "t", actorId: "owner", role: "owner" }]), manifests), /TENANT_NOT_FOUND/);
});
