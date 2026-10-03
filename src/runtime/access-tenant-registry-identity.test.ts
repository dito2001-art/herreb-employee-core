import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
]));

test("actors inside one tenant retain independent identity", () => {
  const map = JSON.stringify([
    { email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" },
    { email: "team@test", tenantId: "t", actorId: "team-1", role: "user" }
  ]);
  assert.equal(resolveAccessIdentityWithRegistry("owner@test", map, manifests)?.actorId, "owner");
  assert.equal(resolveAccessIdentityWithRegistry("team@test", map, manifests)?.actorId, "team-1");
});
