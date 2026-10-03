import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("EMP-002 entitlement remains tenant scoped", () => {
  const registry = new TenantRegistry();
  for (const manifest of parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-001"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]))) registry.registerTenant(manifest);
  assert.throws(() => registry.requireEmployee("a", "EMP-002"));
  assert.equal(registry.requireEmployee("b", "EMP-002").tenantId, "b");
});
