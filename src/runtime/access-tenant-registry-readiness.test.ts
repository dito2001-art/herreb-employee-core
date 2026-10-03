import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("valid multi-tenant store is production-registry ready", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "herreb-client-0", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "herreb:k", offeringNamespace: "herreb:o" },
    { tenantId: "tenant-b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  assert.equal(manifests.length, 2);
});
