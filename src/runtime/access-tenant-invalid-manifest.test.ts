import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("invalid tenant manifest fails before identity routing", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "", enabledEmployees: ["EMP-002"], knowledgeNamespace: "x:k", offeringNamespace: "x:o" }
  ])));
});
