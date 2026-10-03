import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("unknown email never inherits another actor tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([{ email: "known@test", tenantId: "t", actorId: "known", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("other@test", map, manifests), undefined);
});
