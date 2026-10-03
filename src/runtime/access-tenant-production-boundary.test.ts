import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access identity cannot escape configured tenant boundary", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  const map = JSON.stringify([{ email: "person@test", tenantId: "a", actorId: "person", role: "user" }]);
  assert.equal(resolveAccessIdentityWithRegistry("person@test", map, manifests)?.tenantId, "a");
});
