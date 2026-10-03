import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production authenticated email is normalized before lookup", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("OWNER@TEST", map, manifests)?.email, "owner@test");
});
