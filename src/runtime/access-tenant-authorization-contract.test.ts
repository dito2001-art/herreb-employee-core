import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("authorization requires authenticated email to be explicitly mapped", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([{ email: "allowed@test", tenantId: "t", actorId: "allowed", role: "user" }]);
  assert.equal(resolveAccessIdentityWithRegistry("allowed@test", map, manifests)?.actorId, "allowed");
  assert.equal(resolveAccessIdentityWithRegistry("denied@test", map, manifests), undefined);
});
