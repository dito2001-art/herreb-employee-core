import type { EmployeeId } from "./contracts";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  employeeId: EmployeeId;
  correlationId: string;
  capabilityId: string;
  actorId: string;
  subjectId: string;
  summary: string;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  evidence?: Record<string, unknown>;
}

export interface ApprovalDecision {
  tenantId: string;
  approvalId: string;
  actorId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string;
  decidedAt?: string;
}

export interface ApprovalRepository {
  put(tenantId: string, request: ApprovalRequest): Promise<void>;
  get(tenantId: string, approvalId: string): Promise<ApprovalRequest | undefined>;
  listPending(tenantId: string): Promise<ApprovalRequest[]>;
  decide(input: ApprovalDecision): Promise<ApprovalRequest>;
}

function assertTenant(tenantId: string, actualTenantId: string): void {
  if (!tenantId || tenantId !== actualTenantId) {
    throw new Error("APPROVAL_TENANT_ISOLATION_VIOLATION");
  }
}

export function createInMemoryApprovalRepository(): ApprovalRepository {
  const store = new Map<string, ApprovalRequest>();
  const key = (tenantId: string, id: string) => `${tenantId}:${id}`;

  return {
    async put(tenantId, request) {
      assertTenant(tenantId, request.tenantId);
      store.set(key(tenantId, request.id), structuredClone(request));
    },
    async get(tenantId, approvalId) {
      const value = store.get(key(tenantId, approvalId));
      return value ? structuredClone(value) : undefined;
    },
    async listPending(tenantId) {
      return [...store.values()]
        .filter((item) => item.tenantId === tenantId && item.status === "PENDING")
        .map((item) => structuredClone(item));
    },
    async decide(input) {
      const existing = store.get(key(input.tenantId, input.approvalId));
      if (!existing) throw new Error("APPROVAL_NOT_FOUND");
      assertTenant(input.tenantId, existing.tenantId);
      if (existing.status !== "PENDING") throw new Error("APPROVAL_ALREADY_DECIDED");

      const decided: ApprovalRequest = {
        ...existing,
        status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        decidedAt: input.decidedAt ?? new Date().toISOString(),
        decidedBy: input.actorId,
        decisionReason: input.reason
      };
      store.set(key(input.tenantId, input.approvalId), structuredClone(decided));
      return structuredClone(decided);
    }
  };
}

export function isApprovalValidForAction(input: {
  request: ApprovalRequest;
  tenantId: string;
  employeeId: EmployeeId;
  correlationId: string;
  capabilityId: string;
  subjectId: string;
}): boolean {
  const { request } = input;
  return (
    request.status === "APPROVED" &&
    request.tenantId === input.tenantId &&
    request.employeeId === input.employeeId &&
    request.correlationId === input.correlationId &&
    request.capabilityId === input.capabilityId &&
    request.subjectId === input.subjectId
  );
}
