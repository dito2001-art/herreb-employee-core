import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant namespaces are preserved", () => {
  const [manifest] = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "knowledge-x", offeringNamespace: "offer-x" }]));
  assert.equal(manifest?.knowledgeNamespace, "knowledge-x");
  assert.equal(manifest?.offeringNamespace, "offer-x");
});
