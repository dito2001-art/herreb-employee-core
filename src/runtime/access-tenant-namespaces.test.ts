import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant namespace values are preserved exactly", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "tenant/t/knowledge", offeringNamespace: "tenant/t/offerings" }
  ]));
  assert.equal(manifest?.knowledgeNamespace, "tenant/t/knowledge");
  assert.equal(manifest?.offeringNamespace, "tenant/t/offerings");
});
