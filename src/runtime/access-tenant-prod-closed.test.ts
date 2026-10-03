import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant registry access block has explicit allow and deny behavior", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "allow@test", tenantId: "client", actorId: "allow", role: "user" }]);
  assert.ok(resolveAccessIdentityWithRegistry("allow@test", map, manifests));
  assert.equal(resolveAccessIdentityWithRegistry("deny@test", map, manifests), undefined);
});
