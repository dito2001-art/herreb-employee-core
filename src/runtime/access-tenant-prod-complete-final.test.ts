import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant registry integration resolves explicit assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("explicit@test", JSON.stringify([
    { email: "explicit@test", tenantId: "client", actorId: "explicit", role: "owner" }
  ]), manifests);
  assert.equal(identity?.tenantId, "client");
});
