import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant and actor binding whitespace is normalized", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@test", tenantId: " t ", actorId: " owner ", role: "owner" }]);
  const identity = resolveAccessIdentityWithRegistry("owner@test", map, manifests);
  assert.equal(identity?.tenantId, "t");
  assert.equal(identity?.actorId, "owner");
});
