import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("shared registry consumes existing tenant manifest configuration", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  assert.equal(manifest?.tenantId, "t");
  assert.equal(manifest?.name, "t");
});
