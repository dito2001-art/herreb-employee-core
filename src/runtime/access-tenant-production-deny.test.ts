import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production identity configuration fails closed for absent tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "configured", enabledEmployees: ["EMP-002"], knowledgeNamespace: "configured:k", offeringNamespace: "configured:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@test", tenantId: "missing", actorId: "owner", role: "owner" }]);
  assert.throws(() => resolveAccessIdentityWithRegistry("owner@test", map, manifests), /TENANT_NOT_FOUND/);
});
