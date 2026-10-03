import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry contains exactly configured tenant boundaries", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  const registry = buildAccessTenantRegistry([], manifests);
  assert.equal(registry.getTenant("a").tenantId, "a");
  assert.equal(registry.getTenant("b").tenantId, "b");
  assert.throws(() => registry.getTenant("c"), /TENANT_NOT_FOUND/);
});
