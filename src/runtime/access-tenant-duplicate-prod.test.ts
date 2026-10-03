import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("duplicate production email assignment is rejected", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  const map = JSON.stringify([
    { email: "owner@test", tenantId: "t", actorId: "a", role: "owner" },
    { email: "owner@test", tenantId: "t", actorId: "b", role: "user" }
  ]);
  assert.throws(() => resolveAccessIdentityWithRegistry("owner@test", map, manifests), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});
