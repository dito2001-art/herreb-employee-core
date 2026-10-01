import type { EmployeeId, TenantContext } from "./contracts";

export type DurableExecutionMode = "SCHEDULE" | "WORKFLOW" | "QUEUE";

export interface DurableJob<TPayload = unknown> {
  jobId: string;
  context: TenantContext;
  capabilityId: string;
  payload: TPayload;
  idempotencyKey: string;
  notBefore?: string;
  expiresAt?: string;
  requiresApproval?: boolean;
}

export interface DurableDispatchResult {
  accepted: boolean;
  mode: DurableExecutionMode;
  executionId?: string;
  reason: string;
}

export interface DurableDispatcher {
  dispatch(job: DurableJob): Promise<DurableDispatchResult>;
}

export interface DurableRouteInput {
  employeeId: EmployeeId;
  capabilityId: string;
  hasFutureTime?: boolean;
  multiStep?: boolean;
  waitsForExternalEvent?: boolean;
  needsRetryBoundary?: boolean;
  fanOut?: boolean;
}

export function chooseDurableExecutionMode(
  input: DurableRouteInput
): DurableExecutionMode {
  if (input.fanOut) return "QUEUE";
  if (
    input.multiStep ||
    input.waitsForExternalEvent ||
    input.needsRetryBoundary
  ) {
    return "WORKFLOW";
  }
  if (input.hasFutureTime) return "SCHEDULE";
  return "WORKFLOW";
}

export function assertDurableJob(job: DurableJob): void {
  if (!job.jobId.trim()) throw new Error("DURABLE_JOB_ID_REQUIRED");
  if (!job.idempotencyKey.trim())
    throw new Error("DURABLE_IDEMPOTENCY_KEY_REQUIRED");
  if (!job.context.tenantId.trim()) throw new Error("DURABLE_TENANT_REQUIRED");
}
