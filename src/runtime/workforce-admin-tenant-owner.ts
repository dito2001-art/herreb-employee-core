/** M2M owner identity is fixed by server credentials, not caller-controlled headers. */
export interface ScopedM2MActor {
  actorId: string;
  tenantId: string;
  role: "owner";
}
export function resolveScopedM2MOwner(input: {
  authenticated: boolean;
  actorId?: string;
  tenantId?: string;
  requestedTenantId?: string;
}): ScopedM2MActor | undefined {
  if (!input.authenticated) return undefined;
  const actorId = input.actorId?.trim();
  const tenantId = input.tenantId?.trim();
  const requestedTenantId = input.requestedTenantId?.trim();
  if (!actorId || !tenantId || !requestedTenantId || tenantId !== requestedTenantId) return undefined;
  return { actorId, tenantId, role: "owner" };
}
