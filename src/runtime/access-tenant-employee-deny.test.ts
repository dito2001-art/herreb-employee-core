import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("shared registry denies an employee not enabled for tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const registry = buildAccessTenantRegistry([], manifests);
  assert.throws(() => registry.requireEmployee("t", "EMP-001"), /EMPLOYEE_NOT_ENABLED_FOR_TENANT/);
});
