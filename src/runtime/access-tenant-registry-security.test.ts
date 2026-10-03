import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
  { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
]));

test("identity map is the explicit authorization boundary", () => {
  const map = JSON.stringify([{ email: "a@test", tenantId: "a", actorId: "a", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("a@test", map, manifests)?.tenantId, "a");
  assert.equal(resolveAccessIdentityWithRegistry("b@test", map, manifests), undefined);
});

test("identity cannot reference an unregistered tenant", () => {
  const map = JSON.stringify([{ email: "x@test", tenantId: "x", actorId: "x", role: "owner" }]);
  assert.throws(() => resolveAccessIdentityWithRegistry("x@test", map, manifests), /TENANT_NOT_FOUND/);
});
