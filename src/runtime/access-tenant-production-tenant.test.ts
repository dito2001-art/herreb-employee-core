import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production identity tenant must exist in manifest store", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "known", enabledEmployees: ["EMP-002"], knowledgeNamespace: "known:k", offeringNamespace: "known:o" }
  ]));
  assert.throws(() => resolveAccessIdentityWithRegistry("user@test", JSON.stringify([
    { email: "user@test", tenantId: "unknown", actorId: "user", role: "user" }
  ]), manifests), /TENANT_NOT_FOUND/);
});
