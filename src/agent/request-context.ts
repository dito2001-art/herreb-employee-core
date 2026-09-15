import { EmployeeIdSchema, type EmployeeId } from "../core";
import type { RuntimeIdentityInput } from "../runtime";

export interface EmployeeRequestDefaults {
  tenantId?: string;
  employeeId?: EmployeeId;
  workspaceId?: string;
  actorId?: string;
  channel?: string;
}

function readHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)?.trim();
  return value || undefined;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

export function resolveEmployeeRequestIdentity(
  request: Request,
  defaults: EmployeeRequestDefaults = {}
): RuntimeIdentityInput {
  const tenantId = readHeader(request, "X-Tenant-ID") ?? defaults.tenantId;
  const employeeRaw =
    readHeader(request, "X-HerreB-Employee-ID") ?? defaults.employeeId;
  const workspaceId =
    readHeader(request, "X-HerreB-Workspace-ID") ?? defaults.workspaceId;
  const actorId = readHeader(request, "X-HerreB-Actor-ID") ?? defaults.actorId;
  const channel =
    readHeader(request, "X-HerreB-Channel") ?? defaults.channel ?? "web";
  const correlationId =
    readHeader(request, "X-Correlation-ID") ?? crypto.randomUUID();

  return {
    tenantId: required(tenantId, "TENANT_ID"),
    employeeId: EmployeeIdSchema.parse(required(employeeRaw, "EMPLOYEE_ID")),
    workspaceId: required(workspaceId, "WORKSPACE_ID"),
    actorId: required(actorId, "ACTOR_ID"),
    channel,
    correlationId
  };
}
