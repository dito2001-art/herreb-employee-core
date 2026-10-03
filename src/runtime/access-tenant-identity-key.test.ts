import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("lookup email whitespace and case are normalized", () => {
  const identity = resolveAccessIdentityWithRegistry(" OWNER@TEST.LOCAL ", JSON.stringify([{ email: "owner@test.local", tenantId: "t", actorId: "owner", role: "owner" }]), manifests);
  assert.equal(identity?.actorId, "owner");
});
