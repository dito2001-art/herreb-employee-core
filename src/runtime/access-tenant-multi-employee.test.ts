import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("multiple employee entitlements survive registry bridge", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  assert.deepEqual(manifest?.enabledEmployees, ["EMP-001", "EMP-002", "EMP-003"]);
});
