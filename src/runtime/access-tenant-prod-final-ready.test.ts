import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry identity is ready for explicit mapped user", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.ok(resolveAccessIdentityWithRegistry("ready@test", JSON.stringify([
    { email: "ready@test", tenantId: "client", actorId: "ready", role: "user" }
  ]), manifests));
});
