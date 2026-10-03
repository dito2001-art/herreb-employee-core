import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
  { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
]));

test("email mapping cannot substitute actor from another tenant", () => {
  const identity = resolveAccessIdentityWithRegistry("owner@a", JSON.stringify([
    { email: "owner@a", tenantId: "a", actorId: "actor-a", role: "owner" },
    { email: "owner@b", tenantId: "b", actorId: "actor-b", role: "owner" }
  ]), manifests);
  assert.equal(identity?.actorId, "actor-a");
});
