import type { EmployeeId } from "./contracts";

export interface TenantManifest {
  tenantId: string;
  name: string;
  enabledEmployees: EmployeeId[];
  knowledgeNamespace: string;
  offeringNamespace: string;
}

export interface TenantIdentity {
  tenantId: string;
  actorId: string;
  role: "owner" | "team" | "external_contact";
  email?: string;
  whatsapp?: string;
}

function assertTenantId(value: string): string {
  const tenantId = String(value ?? "").trim();
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  return tenantId;
}

export class TenantRegistry {
  private readonly tenants = new Map<string, TenantManifest>();
  private readonly identities = new Map<string, TenantIdentity>();

  registerTenant(manifest: TenantManifest): TenantManifest {
    const tenantId = assertTenantId(manifest.tenantId);
    const normalized: TenantManifest = {
      ...manifest,
      tenantId,
      enabledEmployees: [...new Set(manifest.enabledEmployees)],
    };
    this.tenants.set(tenantId, normalized);
    return normalized;
  }

  getTenant(tenantId: string): TenantManifest {
    const id = assertTenantId(tenantId);
    const tenant = this.tenants.get(id);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    return tenant;
  }

  requireEmployee(tenantId: string, employeeId: EmployeeId): TenantManifest {
    const tenant = this.getTenant(tenantId);
    if (!tenant.enabledEmployees.includes(employeeId)) throw new Error("EMPLOYEE_NOT_ENABLED_FOR_TENANT");
    return tenant;
  }

  registerIdentity(identity: TenantIdentity): TenantIdentity {
    const tenantId = assertTenantId(identity.tenantId);
    this.getTenant(tenantId);
    const normalized = { ...identity, tenantId };
    for (const key of this.identityKeys(normalized)) {
      const existing = this.identities.get(key);
      if (existing && existing.tenantId !== tenantId) throw new Error("IDENTITY_TENANT_CONFLICT");
      this.identities.set(key, normalized);
    }
    return normalized;
  }

  resolveIdentity(input: { email?: string; whatsapp?: string }): TenantIdentity | undefined {
    const matches = this.identityLookupKeys(input)
      .map((key) => this.identities.get(key))
      .filter((value): value is TenantIdentity => Boolean(value));
    if (!matches.length) return undefined;
    const tenantIds = new Set(matches.map((match) => match.tenantId));
    if (tenantIds.size !== 1) throw new Error("IDENTITY_AMBIGUOUS");
    return matches[0];
  }

  assertTenantAccess(identity: TenantIdentity, requestedTenantId: string): void {
    if (identity.tenantId !== assertTenantId(requestedTenantId)) throw new Error("CROSS_TENANT_ACCESS_DENIED");
  }

  private identityKeys(identity: TenantIdentity): string[] {
    return this.identityLookupKeys(identity);
  }

  private identityLookupKeys(input: { email?: string; whatsapp?: string }): string[] {
    const keys: string[] = [];
    const email = input.email?.trim().toLowerCase();
    const whatsapp = input.whatsapp?.replace(/\D/g, "");
    if (email) keys.push(`email:${email}`);
    if (whatsapp) keys.push(`whatsapp:${whatsapp}`);
    if (!keys.length) throw new Error("IDENTITY_KEY_REQUIRED");
    return keys;
  }
}
