import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry, type TenantManifest } from "./tenant-registry";

const tenantA: TenantManifest = {
  tenantId: "herreb-client-0",
  name: "HerreB Client 0",
  enabledEmployees: ["EMP-001", "EMP-002"],
  knowledgeNamespace: "herreb-client-0:knowledge",
  offeringNamespace: "herreb-client-0:offerings"
};
const tenantB: TenantManifest = {
  tenantId: "tenant-b-test",
  name: "Tenant B Synthetic",
  enabledEmployees: ["EMP-002"],
  knowledgeNamespace: "tenant-b-test:knowledge",
  offeringNamespace: "tenant-b-test:offerings"
};

function registry() {
  const r = new TenantRegistry();
  r.registerTenant(tenantA);
  r.registerTenant(tenantB);
  return r;
}

test("TenantRegistry keeps manifests and namespaces tenant-scoped", () => {
  const r = registry();
  assert.equal(r.getTenant("herreb-client-0").knowledgeNamespace, "herreb-client-0:knowledge");
  assert.equal(r.getTenant("tenant-b-test").knowledgeNamespace, "tenant-b-test:knowledge");
});

test("TenantRegistry denies an employee not enabled for Tenant B", () => {
  const r = registry();
  assert.throws(() => r.requireEmployee("tenant-b-test", "EMP-001"), /EMPLOYEE_NOT_ENABLED_FOR_TENANT/);
  assert.equal(r.requireEmployee("tenant-b-test", "EMP-002").tenantId, "tenant-b-test");
});

test("TenantRegistry resolves identities and denies cross-tenant access", () => {
  const r = registry();
  const ownerA = r.registerIdentity({ tenantId: "herreb-client-0", actorId: "owner-a", role: "owner", email: "owner-a@example.test", whatsapp: "+595 981 000 001" });
  r.registerIdentity({ tenantId: "tenant-b-test", actorId: "owner-b", role: "owner", email: "owner-b@example.test", whatsapp: "+595 981 000 002" });
  assert.equal(r.resolveIdentity({ whatsapp: "595981000002" })?.tenantId, "tenant-b-test");
  assert.throws(() => r.assertTenantAccess(ownerA, "tenant-b-test"), /CROSS_TENANT_ACCESS_DENIED/);
});

test("TenantRegistry rejects reusing an identity key across tenants", () => {
  const r = registry();
  r.registerIdentity({ tenantId: "herreb-client-0", actorId: "a", role: "owner", email: "shared@example.test" });
  assert.throws(() => r.registerIdentity({ tenantId: "tenant-b-test", actorId: "b", role: "owner", email: "shared@example.test" }), /IDENTITY_TENANT_CONFLICT/);
});
