import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("verified production identity has tenant scoped provenance", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("owner@client", JSON.stringify([
    { email: "owner@client", tenantId: "client", actorId: "owner", role: "owner" }
  ]), manifests);
  assert.ok(identity);
  assert.equal(accessIdentityProvenance(identity).tenantId, "client");
});
