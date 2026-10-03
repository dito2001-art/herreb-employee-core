import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry is authoritative for tenant existence", () => {
  const registry = buildAccessTenantRegistry([], parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ])));
  assert.equal(registry.getTenant("client").tenantId, "client");
  assert.throws(() => registry.getTenant("missing"), /TENANT_NOT_FOUND/);
});
