import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("duplicate tenant manifests fail closed", () => {
  const raw = JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" },
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k2", offeringNamespace: "t:o2" }
  ]);
  assert.throws(() => parseRuntimeTenantRegistryManifests(raw), /DUPLICATE_TENANT_MANIFEST:t/);
});
