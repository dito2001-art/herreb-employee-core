import type { WorkforceAdminSnapshot } from "../core/workforce-admin";

export type AdminReadActor = { actorId: string; tenantId: string; role: "owner" | "user" | "platform_admin" };

export function scopeWorkforceAdminSnapshot(snapshot: WorkforceAdminSnapshot, actor: AdminReadActor | undefined): WorkforceAdminSnapshot {
  if (!actor || !actor.actorId || !actor.tenantId) throw new Error("WORKFORCE_ADMIN_READ_AUTH_REQUIRED");
  if (actor.role === "platform_admin" && actor.tenantId === "platform") return snapshot;
  if (actor.role !== "owner") throw new Error("WORKFORCE_ADMIN_READ_FORBIDDEN");
  const tenants = snapshot.tenants.filter((tenant) => tenant.tenantId === actor.tenantId);
  if (tenants.length !== 1) throw new Error("WORKFORCE_ADMIN_READ_TENANT_NOT_FOUND");
  return {
    tenants,
    totals: {
      tenants: tenants.length,
      identities: tenants.reduce((sum, tenant) => sum + tenant.identities.length, 0),
      enabledEmployees: tenants.reduce((sum, tenant) => sum + tenant.enabledEmployees.length, 0)
    }
  };
}
