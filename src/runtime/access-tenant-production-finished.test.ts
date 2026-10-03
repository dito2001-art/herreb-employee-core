import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant registry block resolves valid assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.ok(resolveAccessIdentityWithRegistry("valid@test", JSON.stringify([
    { email: "valid@test", tenantId: "client", actorId: "valid", role: "owner" }
  ]), manifests));
});
