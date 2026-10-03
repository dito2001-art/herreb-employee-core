import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("invalid production tenant configuration is rejected", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }])));
});
