import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant namespaces remain distinct", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  assert.notEqual(manifests[0]?.knowledgeNamespace, manifests[1]?.knowledgeNamespace);
  assert.notEqual(manifests[0]?.offeringNamespace, manifests[1]?.offeringNamespace);
});
