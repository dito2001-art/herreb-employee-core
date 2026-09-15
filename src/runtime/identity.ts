import { EmployeeIdSchema, type EmployeeId, type TenantContext } from "../core";

export interface RuntimeIdentityInput {
  tenantId: string;
  employeeId: string;
  workspaceId: string;
  actorId: string;
  channel: string;
  correlationId?: string;
}

export interface RuntimeIdentity {
  context: TenantContext;
  employeeId: EmployeeId;
}

function required(value: string, name: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${name}_REQUIRED`);
  return clean;
}

export function resolveRuntimeIdentity(
  input: RuntimeIdentityInput
): RuntimeIdentity {
  const employeeId = EmployeeIdSchema.parse(input.employeeId);
  const context: TenantContext = {
    tenantId: required(input.tenantId, "TENANT_ID"),
    employeeId,
    workspaceId: required(input.workspaceId, "WORKSPACE_ID"),
    actorId: required(input.actorId, "ACTOR_ID"),
    channel: required(input.channel, "CHANNEL"),
    correlationId: input.correlationId?.trim() || crypto.randomUUID()
  };

  return { context, employeeId };
}
