import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry bridge preserves exact namespaces", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "custom-knowledge", offeringNamespace: "custom-offerings" }]));
  assert.equal(manifest?.knowledgeNamespace, "custom-knowledge");
  assert.equal(manifest?.offeringNamespace, "custom-offerings");
});
