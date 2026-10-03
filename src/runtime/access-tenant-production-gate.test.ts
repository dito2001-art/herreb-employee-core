import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access gate only passes mapped email on registered tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "mapped@test", tenantId: "client", actorId: "mapped", role: "user" }]);
  assert.ok(resolveAccessIdentityWithRegistry("mapped@test", map, manifests));
  assert.equal(resolveAccessIdentityWithRegistry("unmapped@test", map, manifests), undefined);
});
