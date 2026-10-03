import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = JSON.stringify([
  { tenantId: "herreb-client-0", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "herreb-client-0:knowledge", offeringNamespace: "herreb-client-0:offerings" },
  { tenantId: "tenant-b-test", enabledEmployees: ["EMP-002"], knowledgeNamespace: "tenant-b-test:knowledge", offeringNamespace: "tenant-b-test:offerings" }
]);

test("production identity resolves only through a registered tenant", () => {
  const identityMap = JSON.stringify([
    { email: "owner@herreb.test", tenantId: "herreb-client-0", actorId: "owner-a", role: "owner" },
    { email: "team@tenant-b.test", tenantId: "tenant-b-test", actorId: "team-b", role: "user" }
  ]);
  const identity = resolveAccessIdentityWithRegistry("TEAM@TENANT-B.TEST", identityMap, parseRuntimeTenantRegistryManifests(manifests));
  assert.equal(identity?.tenantId, "tenant-b-test");
  assert.equal(identity?.actorId, "team-b");
  assert.equal(identity?.role, "user");
});

test("unknown tenant is denied", () => {
  const identityMap = JSON.stringify([{ email: "ghost@tenant.test", tenantId: "ghost", actorId: "ghost", role: "user" }]);
  assert.throws(() => resolveAccessIdentityWithRegistry("ghost@tenant.test", identityMap, parseRuntimeTenantRegistryManifests(manifests)), /TENANT_NOT_FOUND/);
});

test("duplicate email identity is denied even inside one tenant", () => {
  const identityMap = JSON.stringify([
    { email: "shared@test.local", tenantId: "herreb-client-0", actorId: "a", role: "owner" },
    { email: "shared@test.local", tenantId: "herreb-client-0", actorId: "b", role: "user" }
  ]);
  assert.throws(() => resolveAccessIdentityWithRegistry("shared@test.local", identityMap, parseRuntimeTenantRegistryManifests(manifests)), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});

test("duplicate tenant manifest is denied", () => {
  const duplicate = JSON.stringify([
    { tenantId: "same", enabledEmployees: ["EMP-002"], knowledgeNamespace: "same:k", offeringNamespace: "same:o" },
    { tenantId: "same", enabledEmployees: ["EMP-002"], knowledgeNamespace: "same:k2", offeringNamespace: "same:o2" }
  ]);
  assert.throws(() => parseRuntimeTenantRegistryManifests(duplicate), /DUPLICATE_TENANT_MANIFEST:same/);
});

test("missing or malformed tenant manifest store fails closed", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(undefined), /TENANT_MANIFEST_STORE_NOT_CONFIGURED/);
  assert.throws(() => parseRuntimeTenantRegistryManifests("not-json"), /TENANT_MANIFEST_STORE_INVALID_JSON/);
  assert.throws(() => parseRuntimeTenantRegistryManifests("{}"), /TENANT_MANIFEST_STORE_INVALID/);
});
