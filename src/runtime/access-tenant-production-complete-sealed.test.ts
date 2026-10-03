import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry identity block has explicit allow behavior", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.ok(resolveAccessIdentityWithRegistry("allowed@test", JSON.stringify([
    { email: "allowed@test", tenantId: "client", actorId: "allowed", role: "owner" }
  ]), manifests));
});
