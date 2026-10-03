import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("resolved actor always comes from matching authenticated email", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([
    { email: "one@test", tenantId: "t", actorId: "one", role: "owner" },
    { email: "two@test", tenantId: "t", actorId: "two", role: "user" }
  ]);
  assert.equal(resolveAccessIdentityWithRegistry("two@test", map, manifests)?.actorId, "two");
});
