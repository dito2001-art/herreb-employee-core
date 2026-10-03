import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime bridge keeps knowledge and offering namespaces isolated", () => {
  const result = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  assert.equal(result[0]?.knowledgeNamespace, "a:k");
  assert.equal(result[1]?.knowledgeNamespace, "b:k");
  assert.notEqual(result[0]?.offeringNamespace, result[1]?.offeringNamespace);
});
