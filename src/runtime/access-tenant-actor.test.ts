import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("actor id is preserved after registry validation", () => {
  const identity = resolveAccessIdentityWithRegistry("owner@test.local", JSON.stringify([{ email: "owner@test.local", tenantId: "t", actorId: "actor-123", role: "owner" }]), manifests);
  assert.equal(identity?.actorId, "actor-123");
});
