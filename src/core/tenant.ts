import { TenantContextSchema, type TenantContext } from "./contracts";

export function parseTenantContext(input: unknown): TenantContext {
  return TenantContextSchema.parse(input);
}

export function assertSameTenant(context: TenantContext, resourceTenantId: string): void {
  if (context.tenantId !== resourceTenantId) throw new Error("TENANT_ISOLATION_VIOLATION");
}

function safeKeyPart(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label}_REQUIRED`);
  return encodeURIComponent(clean);
}

// Durable, cache and session keys must preserve the tenant + employee + workspace boundary.
export function tenantScopedKey(
  context: Pick<TenantContext, "tenantId" | "employeeId" | "workspaceId">,
  resource: string
): string {
  return [
    safeKeyPart(context.tenantId, "TENANT_ID"),
    safeKeyPart(context.employeeId, "EMPLOYEE_ID"),
    safeKeyPart(context.workspaceId, "WORKSPACE_ID"),
    safeKeyPart(resource, "RESOURCE_KEY")
  ].join(":");
}
