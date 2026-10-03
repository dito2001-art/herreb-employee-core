import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant registry confirms EMP-002 entitlement", () => {
  const registry = buildAccessTenantRegistry([], parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ])));
  assert.equal(registry.requireEmployee("client", "EMP-002").tenantId, "client");
});
