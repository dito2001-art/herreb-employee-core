import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant registry production block resolves configured actor", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("actor@test", JSON.stringify([
    { email: "actor@test", tenantId: "client", actorId: "actor", role: "user" }
  ]), manifests);
  assert.equal(identity?.actorId, "actor");
});
