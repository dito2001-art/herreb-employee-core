import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
  { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
]));

test("owner mapping resolves only assigned tenant", () => {
  const identity = resolveAccessIdentityWithRegistry("owner@a", JSON.stringify([{ email: "owner@a", tenantId: "a", actorId: "owner-a", role: "owner" }]), manifests);
  assert.equal(identity?.tenantId, "a");
});
