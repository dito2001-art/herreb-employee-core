import type { WorkforceAdminIdentity, WorkforceEmployeeId } from "./workforce-admin";
import type { TenantRegistryManifest } from "./tenant-registry";

export type WorkforceAdminMutation =
  | { type: "tenant.create"; tenant: TenantRegistryManifest }
  | { type: "tenant.employees.set"; tenantId: string; enabledEmployees: WorkforceEmployeeId[] }
  | { type: "identity.upsert"; identity: WorkforceAdminIdentity }
  | { type: "identity.delete"; email: string };

export interface WorkforceAdminMutationPlan {
  manifests: TenantRegistryManifest[];
  identities: WorkforceAdminIdentity[];
}

const allowedEmployees = new Set<WorkforceEmployeeId>(["EMP-001", "EMP-002", "EMP-003"]);

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("WORKFORCE_ADMIN_EMAIL_INVALID");
  return email;
}

function validateEmployees(employees: WorkforceEmployeeId[]): WorkforceEmployeeId[] {
  const unique = [...new Set(employees)];
  if (unique.some((employee) => !allowedEmployees.has(employee))) throw new Error("WORKFORCE_ADMIN_EMPLOYEE_INVALID");
  return unique;
}

export function planWorkforceAdminMutation(
  current: WorkforceAdminMutationPlan,
  mutation: WorkforceAdminMutation
): WorkforceAdminMutationPlan {
  const manifests = current.manifests.map((manifest) => ({ ...manifest, enabledEmployees: [...manifest.enabledEmployees] }));
  const identities = current.identities.map((identity) => ({ ...identity }));

  if (mutation.type === "tenant.create") {
    const tenantId = mutation.tenant.tenantId.trim();
    if (!tenantId || manifests.some((tenant) => tenant.tenantId === tenantId)) throw new Error("WORKFORCE_ADMIN_TENANT_CONFLICT");
    manifests.push({ ...mutation.tenant, tenantId, enabledEmployees: validateEmployees(mutation.tenant.enabledEmployees as WorkforceEmployeeId[]) });
  }

  if (mutation.type === "tenant.employees.set") {
    const tenant = manifests.find((candidate) => candidate.tenantId === mutation.tenantId);
    if (!tenant) throw new Error("WORKFORCE_ADMIN_TENANT_NOT_FOUND");
    tenant.enabledEmployees = validateEmployees(mutation.enabledEmployees);
  }

  if (mutation.type === "identity.upsert") {
    const identity = { ...mutation.identity, email: normalizedEmail(mutation.identity.email) };
    if (!manifests.some((tenant) => tenant.tenantId === identity.tenantId)) throw new Error("WORKFORCE_ADMIN_TENANT_NOT_FOUND");
    const index = identities.findIndex((candidate) => candidate.email.trim().toLowerCase() === identity.email);
    if (index >= 0) identities[index] = identity;
    else identities.push(identity);
  }

  if (mutation.type === "identity.delete") {
    const email = normalizedEmail(mutation.email);
    const index = identities.findIndex((candidate) => candidate.email.trim().toLowerCase() === email);
    if (index < 0) throw new Error("WORKFORCE_ADMIN_IDENTITY_NOT_FOUND");
    identities.splice(index, 1);
  }

  return { manifests, identities };
}
