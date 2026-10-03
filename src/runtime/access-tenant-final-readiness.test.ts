import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("EMP-002 production identity requires both registered tenant and explicit assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "assigned@test", tenantId: "client", actorId: "assigned", role: "user" }]);
  assert.equal(resolveAccessIdentityWithRegistry("assigned@test", map, manifests)?.tenantId, "client");
  assert.equal(resolveAccessIdentityWithRegistry("unassigned@test", map, manifests), undefined);
});
