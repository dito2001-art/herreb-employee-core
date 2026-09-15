import type { AuditEvent, TenantContext } from "./contracts";
import type { CapabilityResult } from "./adapters";
import type { PolicyResult } from "./policy";

export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export function createAuditEvent(
  context: TenantContext,
  capabilityId: string,
  policy: PolicyResult,
  result: CapabilityResult
): AuditEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    tenantId: context.tenantId,
    employeeId: context.employeeId,
    actorId: context.actorId,
    correlationId: context.correlationId,
    capabilityId,
    risk: policy.risk,
    decision: policy.decision,
    outcome: result.ok ? "SUCCESS" : "FAILURE",
    evidence: {
      policyReason: policy.reason,
      ...(result.evidence ?? {}),
      ...(result.error ? { error: result.error } : {})
    }
  };
}

export class InMemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}
