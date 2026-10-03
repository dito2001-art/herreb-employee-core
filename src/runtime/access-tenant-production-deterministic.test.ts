import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production identity resolution is deterministic", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]);
  const first = resolveAccessIdentityWithRegistry("owner@test", map, manifests);
  const second = resolveAccessIdentityWithRegistry("owner@test", map, manifests);
  assert.deepEqual(first, second);
});
