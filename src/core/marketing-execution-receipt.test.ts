import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryApprovalRepository } from "./approvals";
import { submitMarketingApproval } from "./marketing-approval";
import {
  authorizeAndReserveApprovedMarketingAction,
  createInMemoryMarketingExecutionReceiptRepository
} from "./marketing-execution-receipt";
import type { MarketingCycleResult } from "./marketing-cycle";

const context = {
  tenantId: "herreb-client-0",
  employeeId: "EMP-003" as const,
  workspaceId: "marketing",
  actorId: "emp003",
  channel: "portal",
  correlationId: "corr-client0-replay"
};

const cycle: MarketingCycleResult = {
  objective: { id: "obj-replay", tenantId: context.tenantId, title: "Client0 dry run", target: "validate" },
  plan: { id: "plan:obj-replay", tenantId: context.tenantId, objectiveId: "obj-replay", offeringIds: [], audienceIds: [], publishableClaimIds: [], proposedActions: ["campaign.schedule"] },
  approval: { id: "approval:corr-client0-replay:obj-replay", tenantId: context.tenantId, employeeId: "EMP-003", correlationId: context.correlationId, capabilityId: "campaign.schedule", objectiveId: "obj-replay", planId: "plan:obj-replay", decision: "REQUIRE_APPROVAL" }
};

async function approvedRequest() {
  const approvals = createInMemoryApprovalRepository();
  const request = await submitMarketingApproval({ context, cycle, repository: approvals, now: "2026-09-16T10:00:00Z" });
  assert.ok(request);
  return approvals.decide({ tenantId: context.tenantId, approvalId: request.id, actorId: "manager-client0", decision: "APPROVE", decidedAt: "2026-09-16T10:01:00Z" });
}

test("approved marketing action can be reserved exactly once", async () => {
  const request = await approvedRequest();
  const receipts = createInMemoryMarketingExecutionReceiptRepository();
  const first = await authorizeAndReserveApprovedMarketingAction({ context, request, planId: cycle.plan.id, capabilityId: "campaign.schedule", repository: receipts, now: "2026-09-16T10:02:00Z" });
  assert.equal(first.tenantId, context.tenantId);
  assert.equal(first.approvalId, request.id);
  await assert.rejects(
    authorizeAndReserveApprovedMarketingAction({ context, request, planId: cycle.plan.id, capabilityId: "campaign.schedule", repository: receipts }),
    /MARKETING_ACTION_ALREADY_RESERVED/
  );
});

test("wrong capability or tenant cannot reserve approved marketing execution", async () => {
  const request = await approvedRequest();
  const receipts = createInMemoryMarketingExecutionReceiptRepository();
  await assert.rejects(
    authorizeAndReserveApprovedMarketingAction({ context, request, planId: cycle.plan.id, capabilityId: "marketing.write", repository: receipts }),
    /MARKETING_APPROVAL_NOT_VALID_FOR_ACTION/
  );
  await assert.rejects(
    authorizeAndReserveApprovedMarketingAction({ context: { ...context, tenantId: "tenant-b" }, request, planId: cycle.plan.id, capabilityId: "campaign.schedule", repository: receipts }),
    /MARKETING_APPROVAL_NOT_VALID_FOR_ACTION/
  );
});
