import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime tenant bridge preserves enabled employees", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  assert.deepEqual(manifest?.enabledEmployees, ["EMP-001", "EMP-002"]);
});
