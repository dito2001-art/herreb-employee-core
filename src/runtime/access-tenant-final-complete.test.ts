import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("final tenant identity isolation accepts only explicit registered assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "assigned@test", tenantId: "client", actorId: "assigned", role: "user" }]);
  assert.ok(resolveAccessIdentityWithRegistry("assigned@test", map, manifests));
  assert.equal(resolveAccessIdentityWithRegistry("unassigned@test", map, manifests), undefined);
});
