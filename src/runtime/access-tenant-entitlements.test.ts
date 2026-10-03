import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:knowledge", offeringNamespace: "a:offerings" },
  { tenantId: "b", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "b:knowledge", offeringNamespace: "b:offerings" }
]));

test("employee entitlements remain tenant scoped", () => {
  const registry = new TenantRegistry();
  for (const manifest of manifests) registry.registerTenant(manifest);
  assert.equal(registry.requireEmployee("a", "EMP-002").tenantId, "a");
  assert.throws(() => registry.requireEmployee("a", "EMP-001"), /EMPLOYEE_NOT_ENABLED_FOR_TENANT/);
  assert.equal(registry.requireEmployee("b", "EMP-001").tenantId, "b");
});

test("knowledge and offering namespaces remain isolated", () => {
  assert.equal(manifests[0]?.knowledgeNamespace, "a:knowledge");
  assert.equal(manifests[1]?.knowledgeNamespace, "b:knowledge");
  assert.notEqual(manifests[0]?.offeringNamespace, manifests[1]?.offeringNamespace);
});
