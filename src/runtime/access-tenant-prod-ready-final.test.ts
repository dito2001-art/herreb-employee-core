import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry access resolves explicit assignment and denies missing assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "yes@test", tenantId: "client", actorId: "yes", role: "user" }]);
  assert.ok(resolveAccessIdentityWithRegistry("yes@test", map, manifests));
  assert.equal(resolveAccessIdentityWithRegistry("no@test", map, manifests), undefined);
});
