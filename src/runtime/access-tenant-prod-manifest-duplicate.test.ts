import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("duplicate production tenant ids are rejected", () => {
  const raw = JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a", offeringNamespace: "b" },
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "c", offeringNamespace: "d" }
  ]);
  assert.throws(() => parseRuntimeTenantRegistryManifests(raw), /DUPLICATE_TENANT_MANIFEST:t/);
});
