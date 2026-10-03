import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access identity contract is explicit and fail closed", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "allowed@test", tenantId: "client", actorId: "allowed", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("allowed@test", map, manifests)?.tenantId, "client");
  assert.equal(resolveAccessIdentityWithRegistry("denied@test", map, manifests), undefined);
});
