import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("two production identities resolve their own tenants", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  const map = JSON.stringify([
    { email: "a@test", tenantId: "a", actorId: "a", role: "owner" },
    { email: "b@test", tenantId: "b", actorId: "b", role: "owner" }
  ]);
  assert.equal(resolveAccessIdentityWithRegistry("a@test", map, manifests)?.tenantId, "a");
  assert.equal(resolveAccessIdentityWithRegistry("b@test", map, manifests)?.tenantId, "b");
});
