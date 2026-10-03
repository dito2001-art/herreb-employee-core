import assert from "node:assert/strict";
import test from "node:test";
import { accessIdentityProvenance, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
]));

test("owner and user identities retain distinct assurance", () => {
  const map = JSON.stringify([
    { email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" },
    { email: "user@test", tenantId: "t", actorId: "user", role: "user" }
  ]);
  const owner = resolveAccessIdentityWithRegistry("owner@test", map, manifests);
  const user = resolveAccessIdentityWithRegistry("user@test", map, manifests);
  assert.ok(owner && user);
  assert.equal(accessIdentityProvenance(owner).assurance, "OWNER_VERIFIED");
  assert.equal(accessIdentityProvenance(user).assurance, "SERVICE_VERIFIED");
});
