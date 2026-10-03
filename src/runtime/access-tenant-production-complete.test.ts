import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("valid production assignment carries tenant actor role and verified source", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("team@client", JSON.stringify([
    { email: "team@client", tenantId: "client", actorId: "team", role: "user" }
  ]), manifests);
  assert.ok(identity);
  const provenance = accessIdentityProvenance(identity);
  assert.equal(identity.tenantId, provenance.tenantId);
  assert.equal(identity.actorId, provenance.subjectId);
  assert.equal(provenance.source, "cloudflare-access-google");
});
