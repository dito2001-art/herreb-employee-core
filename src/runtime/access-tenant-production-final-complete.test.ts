import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant identity block resolves registered mapped identity", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.ok(resolveAccessIdentityWithRegistry("mapped@test", JSON.stringify([
    { email: "mapped@test", tenantId: "client", actorId: "mapped", role: "user" }
  ]), manifests));
});
