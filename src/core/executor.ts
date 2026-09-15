import { createAuditEvent } from "./audit";
import type { AdapterRegistry, CapabilityRequest, CapabilityResult } from "./adapters";
import { authorizeCapability } from "./policy";

export interface ExecuteOptions {
  approvalGranted?: boolean;
}

export interface ExecutionResult<T = unknown> extends CapabilityResult<T> {
  audit: ReturnType<typeof createAuditEvent>;
}

export async function executeCapability<TInput = unknown, TOutput = unknown>(
  registry: AdapterRegistry,
  request: CapabilityRequest<TInput>,
  options: ExecuteOptions = {}
): Promise<ExecutionResult<TOutput>> {
  const policy = authorizeCapability(request.context, request.capabilityId);

  if (policy.decision === "DENY") {
    const result: CapabilityResult<TOutput> = { ok: false, error: { code: "POLICY_DENIED", message: policy.reason } };
    return { ...result, audit: createAuditEvent(request.context, request.capabilityId, policy, result) };
  }

  if (policy.risk === "YELLOW" && !request.idempotencyKey?.trim()) {
    const result: CapabilityResult<TOutput> = {
      ok: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Side-effecting capabilities require an idempotency key" }
    };
    return { ...result, audit: createAuditEvent(request.context, request.capabilityId, policy, result) };
  }

  if (policy.decision === "REQUIRE_APPROVAL" && !options.approvalGranted) {
    const result: CapabilityResult<TOutput> = { ok: false, error: { code: "APPROVAL_REQUIRED", message: policy.reason } };
    return { ...result, audit: createAuditEvent(request.context, request.capabilityId, policy, result) };
  }

  const adapter = registry.resolve(request.capabilityId, request.context.employeeId);
  if (!adapter) {
    const result: CapabilityResult<TOutput> = { ok: false, error: { code: "ADAPTER_NOT_FOUND", message: "No compatible adapter registered" } };
    return { ...result, audit: createAuditEvent(request.context, request.capabilityId, policy, result) };
  }

  try {
    const adapterResult = (await adapter.execute(request)) as CapabilityResult<TOutput>;
    const result: CapabilityResult<TOutput> = {
      ...adapterResult,
      evidence: {
        ...(adapterResult.evidence ?? {}),
        ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
        ...(policy.decision === "REQUIRE_APPROVAL" ? { approvalGranted: true } : {})
      }
    };
    return { ...result, audit: createAuditEvent(request.context, request.capabilityId, policy, result) };
  } catch (error) {
    const result: CapabilityResult<TOutput> = {
      ok: false,
      error: {
        code: "ADAPTER_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "Unknown adapter error"
      }
    };
    return { ...result, audit: createAuditEvent(request.context, request.capabilityId, policy, result) };
  }
}
