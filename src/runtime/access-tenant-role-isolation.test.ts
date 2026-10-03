import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
  { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
]));

test("role cannot alter resolved tenant", () => {
  const identity = resolveAccessIdentityWithRegistry("user@b.test", JSON.stringify([{ email: "user@b.test", tenantId: "b", actorId: "user-b", role: "user" }]), manifests);
  assert.equal(identity?.tenantId, "b");
  assert.equal(identity?.role, "user");
});
