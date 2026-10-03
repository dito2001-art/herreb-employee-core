import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("incomplete tenant manifest fails schema validation", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"] }])));
});
