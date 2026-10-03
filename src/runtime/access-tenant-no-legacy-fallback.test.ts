import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry backed resolver does not accept legacy map-only tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "registered", enabledEmployees: ["EMP-002"], knowledgeNamespace: "registered:k", offeringNamespace: "registered:o" }
  ]));
  const map = JSON.stringify([{ email: "legacy@test", tenantId: "legacy", actorId: "legacy", role: "owner" }]);
  assert.throws(() => resolveAccessIdentityWithRegistry("legacy@test", map, manifests), /TENANT_NOT_FOUND/);
});
