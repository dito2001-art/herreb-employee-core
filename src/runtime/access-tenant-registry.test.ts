import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = JSON.stringify([
  {
    tenantId: "herreb-client-0",
    enabledEmployees: ["EMP-001", "EMP-002"],
    knowledgeNamespace: "herreb-client-0:knowledge",
    offeringNamespace: "herreb-client-0:offerings"
  },
  {
    tenantId: "tenant-b-test",
    enabledEmployees: ["EMP-002"],
    knowledgeNamespace: "tenant-b-test:knowledge",
    offeringNamespace: "tenant-b-test:offerings"
  }
]);

test("production tenant manifests feed Access identity registry", () => {
  const identityMap = JSON.stringify([
    { email: "owner@herreb.test", tenantId: "herreb-client-0", actorId: "owner-a", role: "owner" },
    { email: "team@tenant-b.test", tenantId: "tenant-b-test", actorId: "team-b", role: "user" }
  ]);
  const identity = resolveAccessIdentityWithRegistry(
    "TEAM@TENANT-B.TEST",
    identityMap,
    parseRuntimeTenantRegistryManifests(manifests)
  );
  assert.equal(identity?.tenantId, "tenant-b-test");
  assert.equal(identity?.actorId, "team-b");
});

test("production authentication rejects identity mapped to absent tenant", () => {
  const identityMap = JSON.stringify([
    { email: "ghost@tenant.test", tenantId: "ghost", actorId: "ghost", role: "user" }
  ]);
  assert.throws(
    () => resolveAccessIdentityWithRegistry("ghost@tenant.test", identityMap, parseRuntimeTenantRegistryManifests(manifests)),
    /TENANT_NOT_FOUND/
  );
});

test("production authentication rejects duplicate cross-tenant email", () => {
  const identityMap = JSON.stringify([
    { email: "shared@test.local", tenantId: "herreb-client-0", actorId: "a", role: "owner" },
    { email: "shared@test.local", tenantId: "tenant-b-test", actorId: "b", role: "owner" }
  ]);
  assert.throws(
    () => resolveAccessIdentityWithRegistry("shared@test.local", identityMap, parseRuntimeTenantRegistryManifests(manifests)),
    /IDENTITY_TENANT_CONFLICT/
  );
});
