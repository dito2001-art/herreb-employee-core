import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("same email mapped twice in one tenant is rejected by registry key conflict when actor differs", () => {
  const map = JSON.stringify([
    { email: "shared@test", tenantId: "t", actorId: "a", role: "owner" },
    { email: "shared@test", tenantId: "t", actorId: "b", role: "user" }
  ]);
  const identity = resolveAccessIdentityWithRegistry("shared@test", map, manifests);
  assert.equal(identity?.actorId, "b");
});
