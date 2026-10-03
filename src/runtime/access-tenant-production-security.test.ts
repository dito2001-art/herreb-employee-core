import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant security model is explicit assignment plus registered tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "registered", enabledEmployees: ["EMP-002"], knowledgeNamespace: "registered:k", offeringNamespace: "registered:o" }
  ]));
  const valid = JSON.stringify([{ email: "valid@test", tenantId: "registered", actorId: "valid", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("valid@test", valid, manifests)?.tenantId, "registered");
  assert.equal(resolveAccessIdentityWithRegistry("unknown@test", valid, manifests), undefined);
});
