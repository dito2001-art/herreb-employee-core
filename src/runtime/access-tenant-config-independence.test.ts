import assert from "node:assert/strict";
import test from "node:test";
import { parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant manifests and identity bindings remain separate configuration layers", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const identities = parseAccessIdentityBindings(JSON.stringify([
    { email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }
  ]));
  assert.equal(manifests.length, 1);
  assert.equal(identities.length, 1);
  assert.equal(manifests[0]?.tenantId, identities[0]?.tenantId);
});
