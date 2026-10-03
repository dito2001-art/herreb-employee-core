import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("duplicate employee entitlements are normalized", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002", "EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  assert.deepEqual(manifest?.enabledEmployees, ["EMP-002"]);
});
