import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access tenant coverage has explicit authorization boundary", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "allowed@test", tenantId: "client", actorId: "allowed", role: "owner" }]);
  assert.ok(resolveAccessIdentityWithRegistry("allowed@test", map, manifests));
  assert.equal(resolveAccessIdentityWithRegistry("not-allowed@test", map, manifests), undefined);
});
