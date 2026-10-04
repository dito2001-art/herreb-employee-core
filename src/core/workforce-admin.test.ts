import assert from "node:assert/strict";
import test from "node:test";
import type { TenantRegistryManifest } from "./tenant-registry";
import { buildWorkforceAdminSnapshot } from "./workforce-admin";

const manifests: TenantRegistryManifest[] = [
  { tenantId: "herreb-client-0", name: "HerreB", enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"], knowledgeNamespace: "herreb:k", offeringNamespace: "herreb:o" },
  { tenantId: "pilot-1", name: "Pilot 1", enabledEmployees: ["EMP-002"], knowledgeNamespace: "pilot:k", offeringNamespace: "pilot:o" }
];

test("admin snapshot projects tenants identities and employee entitlements", () => {
  const snapshot = buildWorkforceAdminSnapshot(manifests, [
    { email: "owner@herreb.test", tenantId: "herreb-client-0", actorId: "owner", role: "owner" },
    { email: "team@pilot.test", tenantId: "pilot-1", actorId: "team", role: "user" }
  ]);
  assert.deepEqual(snapshot.totals, { tenants: 2, identities: 2, enabledEmployees: 4 });
  assert.deepEqual(snapshot.tenants[0]?.enabledEmployees, ["EMP-001", "EMP-002", "EMP-003"]);
  assert.equal(snapshot.tenants[1]?.identities[0]?.email, "team@pilot.test");
});

test("admin snapshot denies identity assigned to unknown tenant", () => {
  assert.throws(() => buildWorkforceAdminSnapshot(manifests, [
    { email: "ghost@test", tenantId: "missing", actorId: "ghost", role: "owner" }
  ]), /TENANT_NOT_FOUND/);
});

test("admin snapshot rejects duplicate normalized email", () => {
  assert.throws(() => buildWorkforceAdminSnapshot(manifests, [
    { email: "OWNER@test", tenantId: "herreb-client-0", actorId: "owner", role: "owner" },
    { email: "owner@test", tenantId: "pilot-1", actorId: "other", role: "user" }
  ]), /WORKFORCE_ADMIN_DUPLICATE_EMAIL/);
});

test("admin snapshot accepts only the typed initial employee catalog", () => {
  const snapshot = buildWorkforceAdminSnapshot([
    { tenantId: "t", name: "T", enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ], []);
  assert.deepEqual(snapshot.tenants[0]?.enabledEmployees, ["EMP-001", "EMP-002", "EMP-003"]);
});
