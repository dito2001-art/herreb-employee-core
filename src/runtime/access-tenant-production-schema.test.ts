import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant manifests are schema validated before registry creation", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: [], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ])));
});
