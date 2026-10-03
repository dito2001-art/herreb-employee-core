import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry name derives from tenant id", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "tenant-a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" }]));
  assert.equal(manifest?.name, "tenant-a");
});
