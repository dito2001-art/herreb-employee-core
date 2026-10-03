import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registered tenant and mapped identity are both required for authorization", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "authorized@test", tenantId: "client", actorId: "authorized", role: "owner" }]);
  assert.ok(resolveAccessIdentityWithRegistry("authorized@test", map, manifests));
  assert.equal(resolveAccessIdentityWithRegistry("unauthorized@test", map, manifests), undefined);
});
