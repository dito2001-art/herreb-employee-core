import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("owner and user remain separate actors inside the same tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([
    { email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" },
    { email: "user@test", tenantId: "t", actorId: "user", role: "user" }
  ]);
  assert.notEqual(resolveAccessIdentityWithRegistry("owner@test", map, manifests)?.actorId, resolveAccessIdentityWithRegistry("user@test", map, manifests)?.actorId);
});
