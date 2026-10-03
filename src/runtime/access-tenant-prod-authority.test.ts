import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant registry remains authority over identity map tenant references", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "known", enabledEmployees: ["EMP-002"], knowledgeNamespace: "known:k", offeringNamespace: "known:o" }
  ]));
  assert.throws(() => resolveAccessIdentityWithRegistry("user@test", JSON.stringify([
    { email: "user@test", tenantId: "missing", actorId: "user", role: "user" }
  ]), manifests), /TENANT_NOT_FOUND/);
});
