import type { AuditEvent, TenantContext } from "./contracts";
import type { ApprovalRepository, ApprovalRequest } from "./approvals";
import { isApprovalValidForAction } from "./approvals";
import type { MarketingCycleResult } from "./marketing-cycle";

export async function submitMarketingApproval(input: {
  context: TenantContext;
  cycle: MarketingCycleResult;
  repository: ApprovalRepository;
  now?: string;
}): Promise<ApprovalRequest | undefined> {
  const approval = input.cycle.approval;
  if (!approval) return undefined;
  if (
    input.context.tenantId !== approval.tenantId ||
    input.context.employeeId !== approval.employeeId ||
    input.context.correlationId !== approval.correlationId ||
    input.cycle.plan.tenantId !== input.context.tenantId
  ) {
    throw new Error("MARKETING_APPROVAL_CONTEXT_MISMATCH");
  }

  const request: ApprovalRequest = {
    id: approval.id,
    tenantId: approval.tenantId,
    employeeId: approval.employeeId,
    correlationId: approval.correlationId,
    capabilityId: approval.capabilityId,
    actorId: input.context.actorId,
    subjectId: approval.planId,
    summary: `Approve ${approval.capabilityId} for ${input.cycle.objective.title}`,
    status: "PENDING",
    requestedAt: input.now ?? new Date().toISOString(),
    evidence: {
      objectiveId: approval.objectiveId,
      planId: approval.planId,
      budget: approval.budget,
      currency: approval.currency
    }
  };
  await input.repository.put(input.context.tenantId, request);
  return request;
}

export function authorizeApprovedMarketingAction(input: {
  context: TenantContext;
  request: ApprovalRequest;
  planId: string;
}): void {
  if (
    !isApprovalValidForAction({
      request: input.request,
      tenantId: input.context.tenantId,
      employeeId: input.context.employeeId,
      correlationId: input.context.correlationId,
      capabilityId: input.request.capabilityId,
      subjectId: input.planId
    })
  ) {
    throw new Error("MARKETING_APPROVAL_NOT_VALID_FOR_ACTION");
  }
}

export function createMarketingApprovalAuditEvent(input: {
  context: TenantContext;
  request: ApprovalRequest;
}): AuditEvent {
  const approved = input.request.status === "APPROVED";
  return {
    eventId: `approval-audit:${input.request.id}`,
    timestamp: input.request.decidedAt ?? input.request.requestedAt,
    tenantId: input.request.tenantId,
    employeeId: input.request.employeeId,
    actorId: input.request.decidedBy ?? input.context.actorId,
    correlationId: input.request.correlationId,
    capabilityId: input.request.capabilityId,
    risk: "YELLOW",
    decision: "REQUIRE_APPROVAL",
    outcome: approved ? "SUCCESS" : "FAILURE",
    evidence: {
      approvalId: input.request.id,
      approvalStatus: input.request.status,
      subjectId: input.request.subjectId,
      requestedBy: input.request.actorId,
      decidedBy: input.request.decidedBy,
      decisionReason: input.request.decisionReason,
      ...input.request.evidence
    }
  };
}
