import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime identity integration returns tenant actor and role", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("team@test", JSON.stringify([
    { email: "team@test", tenantId: "client", actorId: "team", role: "user" }
  ]), manifests);
  assert.deepEqual(identity && [identity.tenantId, identity.actorId, identity.role], ["client", "team", "user"]);
});
