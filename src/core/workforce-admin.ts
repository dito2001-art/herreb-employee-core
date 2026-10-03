import { TenantRegistry, type TenantRegistryManifest } from "./tenant-registry";

export type WorkforceEmployeeId = "EMP-001" | "EMP-002" | "EMP-003";

export interface WorkforceAdminIdentity {
  email: string;
  tenantId: string;
  actorId: string;
  role: "owner" | "user";
}

export interface WorkforceTenantAdminRecord {
  tenantId: string;
  enabledEmployees: WorkforceEmployeeId[];
  knowledgeNamespace: string;
  offeringNamespace: string;
  identities: WorkforceAdminIdentity[];
}

export interface WorkforceAdminSnapshot {
  tenants: WorkforceTenantAdminRecord[];
  totals: {
    tenants: number;
    identities: number;
    enabledEmployees: number;
  };
}

const allowedEmployees = new Set<WorkforceEmployeeId>(["EMP-001", "EMP-002", "EMP-003"]);

function normalizeIdentity(identity: WorkforceAdminIdentity): WorkforceAdminIdentity {
  const email = identity.email.trim().toLowerCase();
  const tenantId = identity.tenantId.trim();
  const actorId = identity.actorId.trim();
  if (!email || !tenantId || !actorId) throw new Error("WORKFORCE_ADMIN_IDENTITY_INVALID");
  if (identity.role !== "owner" && identity.role !== "user") throw new Error("WORKFORCE_ADMIN_ROLE_INVALID");
  return { ...identity, email, tenantId, actorId };
}

export function buildWorkforceAdminSnapshot(
  manifests: TenantRegistryManifest[],
  identities: WorkforceAdminIdentity[]
): WorkforceAdminSnapshot {
  const registry = new TenantRegistry();
  const seenTenants = new Set<string>();
  for (const manifest of manifests) {
    if (seenTenants.has(manifest.tenantId)) throw new Error(`DUPLICATE_TENANT_MANIFEST:${manifest.tenantId}`);
    seenTenants.add(manifest.tenantId);
    for (const employee of manifest.enabledEmployees) {
      if (!allowedEmployees.has(employee as WorkforceEmployeeId)) throw new Error(`WORKFORCE_ADMIN_EMPLOYEE_INVALID:${employee}`);
    }
    registry.registerTenant(manifest);
  }

  const normalized = identities.map(normalizeIdentity);
  const seenEmails = new Set<string>();
  for (const identity of normalized) {
    if (seenEmails.has(identity.email)) throw new Error(`WORKFORCE_ADMIN_DUPLICATE_EMAIL:${identity.email}`);
    seenEmails.add(identity.email);
    registry.getTenant(identity.tenantId);
    registry.registerIdentity({
      tenantId: identity.tenantId,
      actorId: identity.actorId,
      email: identity.email,
      role: identity.role === "owner" ? "owner" : "team"
    });
  }

  const tenants = manifests.map((manifest) => ({
    tenantId: manifest.tenantId,
    enabledEmployees: [...manifest.enabledEmployees] as WorkforceEmployeeId[],
    knowledgeNamespace: manifest.knowledgeNamespace,
    offeringNamespace: manifest.offeringNamespace,
    identities: normalized.filter((identity) => identity.tenantId === manifest.tenantId)
  }));

  return {
    tenants,
    totals: {
      tenants: tenants.length,
      identities: normalized.length,
      enabledEmployees: tenants.reduce((total, tenant) => total + tenant.enabledEmployees.length, 0)
    }
  };
}
