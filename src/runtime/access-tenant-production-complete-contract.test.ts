import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("complete production contract requires registered tenant and mapped user", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "mapped@test", tenantId: "client", actorId: "mapped", role: "user" }]);
  assert.equal(resolveAccessIdentityWithRegistry("mapped@test", map, manifests)?.tenantId, "client");
  assert.equal(resolveAccessIdentityWithRegistry("other@test", map, manifests), undefined);
});
