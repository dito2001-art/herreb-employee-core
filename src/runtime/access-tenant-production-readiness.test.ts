import assert from "node:assert/strict";
import test from "node:test";
import { accessAgentInstanceSuffix, accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production identity yields tenant actor provenance and isolated instance", async () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("owner@client", JSON.stringify([
    { email: "owner@client", tenantId: "client", actorId: "owner", role: "owner" }
  ]), manifests);
  assert.ok(identity);
  assert.equal(accessIdentityProvenance(identity).tenantId, "client");
  assert.match(await accessAgentInstanceSuffix(identity), /^[0-9a-f]{24}$/);
});
