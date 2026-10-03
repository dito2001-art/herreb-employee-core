import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry tenant name derives from canonical tenant id", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "client-x", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.equal(manifest?.name, "client-x");
});
