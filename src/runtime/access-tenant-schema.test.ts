import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("invalid production tenant manifest fails closed", () => {
  const raw = JSON.stringify([{ tenantId: "t", enabledEmployees: [], knowledgeNamespace: "", offeringNamespace: "" }]);
  assert.throws(() => parseRuntimeTenantRegistryManifests(raw));
});
