import { TenantContextSchema, type TenantContext } from "./contracts";

export function parseTenantContext(input: unknown): TenantContext {
  return TenantContextSchema.parse(input);
}

export function assertSameTenant(
  context: TenantContext,
  resourceTenantId: string
): void {
  if (context.tenantId !== resourceTenantId) {
    throw new Error("TENANT_ISOLATION_VIOLATION");
  }
}

export function tenantScopedKey(
  context: Pick<TenantContext, "tenantId" | "employeeId" | "workspaceId">,
  resource: string
): string {
  const clean = resource.trim();
  if (!clean) throw new Error("RESOURCE_KEY_REQUIRED");
  return `${context.tenantId}:${context.employeeId}:${context.workspaceId}:${clean}`;
}
