import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry validation does not mutate runtime owner user role contract", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const owner = resolveAccessIdentityWithRegistry("owner@test", JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]), manifests);
  const user = resolveAccessIdentityWithRegistry("user@test", JSON.stringify([{ email: "user@test", tenantId: "t", actorId: "user", role: "user" }]), manifests);
  assert.equal(owner?.role, "owner");
  assert.equal(user?.role, "user");
});
