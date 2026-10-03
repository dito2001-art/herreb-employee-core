import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry manifest name is deterministically tenant id", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client-123", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client-123:k", offeringNamespace: "client-123:o" }
  ]));
  assert.equal(manifest?.name, "client-123");
});
