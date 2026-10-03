import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant employee list is normalized", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002", "EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.deepEqual(manifest?.enabledEmployees, ["EMP-002"]);
});
