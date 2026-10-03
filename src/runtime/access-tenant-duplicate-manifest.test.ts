import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("duplicate tenant manifests remain deterministic", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" },
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k2", offeringNamespace: "t:o2" }
  ]));
  const registry = buildAccessTenantRegistry([], manifests);
  assert.equal(registry.getTenant("t").knowledgeNamespace, "t:k2");
});
