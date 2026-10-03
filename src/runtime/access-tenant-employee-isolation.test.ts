import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("employee enabled in one tenant is not inherited by another", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  const registry = buildAccessTenantRegistry([], manifests);
  assert.throws(() => registry.requireEmployee("a", "EMP-001"), /EMPLOYEE_NOT_ENABLED_FOR_TENANT/);
  assert.equal(registry.requireEmployee("b", "EMP-001").tenantId, "b");
});
