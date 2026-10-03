import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("valid production registry contract parses", () => {
  const result = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }]));
  assert.equal(result.length, 1);
});
