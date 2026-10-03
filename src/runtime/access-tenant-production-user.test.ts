import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production team user resolves with service verified provenance", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("team@client", JSON.stringify([
    { email: "team@client", tenantId: "client", actorId: "team", role: "user" }
  ]), manifests);
  assert.ok(identity);
  assert.equal(identity.role, "user");
  assert.equal(accessIdentityProvenance(identity).assurance, "SERVICE_VERIFIED");
});
