import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("unknown employee id fails tenant schema validation", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-999"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }])));
});
