import type { TenantContext } from "./contracts";
import type { ApprovalRequest } from "./approvals";
import { authorizeApprovedMarketingAction } from "./marketing-approval";

export interface MarketingExecutionReceipt {
  id: string;
  tenantId: string;
  employeeId: "EMP-003";
  correlationId: string;
  approvalId: string;
  capabilityId: string;
  subjectId: string;
  reservedAt: string;
}

export interface MarketingExecutionReceiptRepository {
  reserve(receipt: MarketingExecutionReceipt): Promise<boolean>;
  get(tenantId: string, id: string): Promise<MarketingExecutionReceipt | undefined>;
}

export function marketingExecutionReceiptId(input: {
  tenantId: string;
  employeeId: string;
  correlationId: string;
  approvalId: string;
  capabilityId: string;
  subjectId: string;
}): string {
  return [
    input.tenantId,
    input.employeeId,
    input.correlationId,
    input.approvalId,
    input.capabilityId,
    input.subjectId
  ].join(":");
}

export function createInMemoryMarketingExecutionReceiptRepository(): MarketingExecutionReceiptRepository {
  const store = new Map<string, MarketingExecutionReceipt>();
  return {
    async reserve(receipt) {
      if (store.has(receipt.id)) return false;
      store.set(receipt.id, structuredClone(receipt));
      return true;
    },
    async get(tenantId, id) {
      const receipt = store.get(id);
      if (!receipt || receipt.tenantId !== tenantId) return undefined;
      return structuredClone(receipt);
    }
  };
}

export async function authorizeAndReserveApprovedMarketingAction(input: {
  context: TenantContext;
  request: ApprovalRequest;
  planId: string;
  capabilityId: string;
  repository: MarketingExecutionReceiptRepository;
  now?: string;
}): Promise<MarketingExecutionReceipt> {
  authorizeApprovedMarketingAction({
    context: input.context,
    request: input.request,
    planId: input.planId,
    capabilityId: input.capabilityId
  });

  if (input.context.employeeId !== "EMP-003") throw new Error("EMP003_REQUIRED");
  const receipt: MarketingExecutionReceipt = {
    id: marketingExecutionReceiptId({
      tenantId: input.context.tenantId,
      employeeId: input.context.employeeId,
      correlationId: input.context.correlationId,
      approvalId: input.request.id,
      capabilityId: input.capabilityId,
      subjectId: input.planId
    }),
    tenantId: input.context.tenantId,
    employeeId: "EMP-003",
    correlationId: input.context.correlationId,
    approvalId: input.request.id,
    capabilityId: input.capabilityId,
    subjectId: input.planId,
    reservedAt: input.now ?? new Date().toISOString()
  };

  if (!(await input.repository.reserve(receipt))) {
    throw new Error("MARKETING_ACTION_ALREADY_RESERVED");
  }
  return receipt;
}
