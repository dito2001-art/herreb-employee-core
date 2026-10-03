import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("mapped production user receives verified tenant provenance", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("user@client", JSON.stringify([
    { email: "user@client", tenantId: "client", actorId: "user", role: "user" }
  ]), manifests);
  assert.ok(identity);
  assert.equal(accessIdentityProvenance(identity).tenantId, "client");
});
