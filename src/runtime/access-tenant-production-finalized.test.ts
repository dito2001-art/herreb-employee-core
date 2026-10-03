import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry backed tenant identity resolves configured production user", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.equal(resolveAccessIdentityWithRegistry("user@test", JSON.stringify([
    { email: "user@test", tenantId: "client", actorId: "user", role: "user" }
  ]), manifests)?.tenantId, "client");
});
