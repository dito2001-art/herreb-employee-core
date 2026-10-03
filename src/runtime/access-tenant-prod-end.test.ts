import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry integration returns configured tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.equal(resolveAccessIdentityWithRegistry("configured@test", JSON.stringify([
    { email: "configured@test", tenantId: "client", actorId: "configured", role: "owner" }
  ]), manifests)?.tenantId, "client");
});
