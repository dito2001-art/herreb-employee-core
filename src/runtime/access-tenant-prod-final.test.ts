import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry bridge returns canonical manifest", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.deepEqual(manifest, { tenantId: "t", name: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" });
});
