import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
  { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
]));

test("duplicate email across tenants fails closed before routing", () => {
  const map = JSON.stringify([
    { email: "shared@test", tenantId: "a", actorId: "a", role: "owner" },
    { email: "shared@test", tenantId: "b", actorId: "b", role: "owner" }
  ]);
  assert.throws(() => resolveAccessIdentityWithRegistry("shared@test", map, manifests), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});
