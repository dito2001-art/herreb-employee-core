import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry backed production identity resolves explicit mapping", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const result = resolveAccessIdentityWithRegistry("final@test", JSON.stringify([
    { email: "final@test", tenantId: "client", actorId: "final", role: "owner" }
  ]), manifests);
  assert.equal(result?.tenantId, "client");
});
