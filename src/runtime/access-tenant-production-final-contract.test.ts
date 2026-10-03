import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access tenant contract is canonical", () => {
  const [m] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.equal(m?.tenantId, "t");
});
