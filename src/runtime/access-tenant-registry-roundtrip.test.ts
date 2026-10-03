import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("validated runtime manifest roundtrips through shared registry", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const registry = buildAccessTenantRegistry([], manifests);
  assert.equal(registry.getTenant("t").knowledgeNamespace, "t:k");
  assert.equal(registry.requireEmployee("t", "EMP-002").offeringNamespace, "t:o");
});
