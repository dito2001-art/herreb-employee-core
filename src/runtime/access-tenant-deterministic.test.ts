import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("same access configuration resolves identically across calls", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]);
  assert.deepEqual(resolveAccessIdentityWithRegistry("owner@test", map, manifests), resolveAccessIdentityWithRegistry("owner@test", map, manifests));
});
