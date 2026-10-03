import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("explicit production mapping remains tenant isolated", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  assert.equal(resolveAccessIdentityWithRegistry("a@test", JSON.stringify([
    { email: "a@test", tenantId: "a", actorId: "a", role: "owner" }
  ]), manifests)?.tenantId, "a");
});
