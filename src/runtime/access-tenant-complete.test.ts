import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix, accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("validated identity produces tenant provenance and scoped instance", async () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  const identity = resolveAccessIdentityWithRegistry("owner@test", JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]), manifests);
  assert.ok(identity);
  assert.equal(accessIdentityProvenance(identity).tenantId, "t");
  assert.equal((await accessAgentInstanceSuffix(identity)).length, 24);
});
