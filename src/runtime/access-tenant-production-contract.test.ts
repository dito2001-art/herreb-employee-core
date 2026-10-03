import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access contract resolves tenant actor role and provenance together", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client-0", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client-0:k", offeringNamespace: "client-0:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry(
    "owner@client.test",
    JSON.stringify([{ email: "owner@client.test", tenantId: "client-0", actorId: "owner-0", role: "owner" }]),
    manifests
  );
  assert.ok(identity);
  assert.deepEqual(
    { tenantId: identity.tenantId, actorId: identity.actorId, role: identity.role },
    { tenantId: "client-0", actorId: "owner-0", role: "owner" }
  );
  const provenance = accessIdentityProvenance(identity);
  assert.equal(provenance.tenantId, "client-0");
  assert.equal(provenance.subjectId, "owner-0");
  assert.equal(provenance.assurance, "OWNER_VERIFIED");
});
