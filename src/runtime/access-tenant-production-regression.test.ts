import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentity, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry backed production resolver is stricter than legacy map-only resolver", () => {
  const map = JSON.stringify([{ email: "legacy@test", tenantId: "legacy", actorId: "legacy", role: "owner" }]);
  assert.equal(resolveAccessIdentity("legacy@test", map)?.tenantId, "legacy");
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "registered", enabledEmployees: ["EMP-002"], knowledgeNamespace: "registered:k", offeringNamespace: "registered:o" }
  ]));
  assert.throws(() => resolveAccessIdentityWithRegistry("legacy@test", map, manifests), /TENANT_NOT_FOUND/);
});
