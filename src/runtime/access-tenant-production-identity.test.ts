import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production identity binding retains email tenant actor and role", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("person@test", JSON.stringify([
    { email: "person@test", tenantId: "client", actorId: "person", role: "user" }
  ]), manifests);
  assert.deepEqual(identity, { email: "person@test", tenantId: "client", actorId: "person", role: "user" });
});
