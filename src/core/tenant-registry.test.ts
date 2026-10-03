import { describe, expect, it } from "vitest";
import { TenantRegistry } from "./tenant-registry";

const tenantA = {
  tenantId: "herreb-client-0",
  name: "HerreB Client 0",
  enabledEmployees: ["EMP-001", "EMP-002"] as const,
  knowledgeNamespace: "herreb-client-0:knowledge",
  offeringNamespace: "herreb-client-0:offerings",
};
const tenantB = {
  tenantId: "tenant-b-test",
  name: "Tenant B Synthetic",
  enabledEmployees: ["EMP-002"] as const,
  knowledgeNamespace: "tenant-b-test:knowledge",
  offeringNamespace: "tenant-b-test:offerings",
};

function registry() {
  const r = new TenantRegistry();
  r.registerTenant({ ...tenantA, enabledEmployees: [...tenantA.enabledEmployees] });
  r.registerTenant({ ...tenantB, enabledEmployees: [...tenantB.enabledEmployees] });
  return r;
}

describe("TenantRegistry isolation", () => {
  it("keeps manifests and namespaces tenant-scoped", () => {
    const r = registry();
    expect(r.getTenant("herreb-client-0").knowledgeNamespace).toBe("herreb-client-0:knowledge");
    expect(r.getTenant("tenant-b-test").knowledgeNamespace).toBe("tenant-b-test:knowledge");
  });

  it("denies an employee not enabled for Tenant B", () => {
    const r = registry();
    expect(() => r.requireEmployee("tenant-b-test", "EMP-001")).toThrow("EMPLOYEE_NOT_ENABLED_FOR_TENANT");
    expect(r.requireEmployee("tenant-b-test", "EMP-002").tenantId).toBe("tenant-b-test");
  });

  it("resolves identities deterministically and denies cross-tenant access", () => {
    const r = registry();
    const ownerA = r.registerIdentity({ tenantId: "herreb-client-0", actorId: "owner-a", role: "owner", email: "owner-a@example.test", whatsapp: "+595 981 000 001" });
    r.registerIdentity({ tenantId: "tenant-b-test", actorId: "owner-b", role: "owner", email: "owner-b@example.test", whatsapp: "+595 981 000 002" });
    expect(r.resolveIdentity({ whatsapp: "595981000002" })?.tenantId).toBe("tenant-b-test");
    expect(() => r.assertTenantAccess(ownerA, "tenant-b-test")).toThrow("CROSS_TENANT_ACCESS_DENIED");
  });

  it("rejects reusing an identity key across tenants", () => {
    const r = registry();
    r.registerIdentity({ tenantId: "herreb-client-0", actorId: "a", role: "owner", email: "shared@example.test" });
    expect(() => r.registerIdentity({ tenantId: "tenant-b-test", actorId: "b", role: "owner", email: "shared@example.test" })).toThrow("IDENTITY_TENANT_CONFLICT");
  });
});
