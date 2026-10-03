import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production resolver accepts explicit valid assignment and nothing else", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "person@test", tenantId: "client", actorId: "person", role: "user" }]);
  assert.equal(resolveAccessIdentityWithRegistry("person@test", map, manifests)?.tenantId, "client");
  assert.equal(resolveAccessIdentityWithRegistry("other@test", map, manifests), undefined);
});
