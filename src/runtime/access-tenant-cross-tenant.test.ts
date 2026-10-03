import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("same normalized email cannot be assigned across tenants", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  const map = JSON.stringify([
    { email: "shared@test", tenantId: "a", actorId: "a", role: "owner" },
    { email: "SHARED@test", tenantId: "b", actorId: "b", role: "owner" }
  ]);
  assert.throws(() => resolveAccessIdentityWithRegistry("shared@test", map, manifests), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});
