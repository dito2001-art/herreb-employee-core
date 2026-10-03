import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "tenant-a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" }
]));

test("access email is normalized before registry resolution", () => {
  const map = JSON.stringify([{ email: " OWNER@Test.Local ", tenantId: "tenant-a", actorId: "owner", role: "owner" }]);
  const identity = resolveAccessIdentityWithRegistry("OWNER@TEST.LOCAL", map, manifests);
  assert.equal(identity?.email, "owner@test.local");
});

test("unassigned authenticated identity remains denied", () => {
  const map = JSON.stringify([{ email: "owner@test.local", tenantId: "tenant-a", actorId: "owner", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("missing@test.local", map, manifests), undefined);
});
