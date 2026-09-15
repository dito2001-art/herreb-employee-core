import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryApprovalRepository } from "./approvals";
import {
  authorizeApprovedMarketingAction,
  createMarketingApprovalAuditEvent,
  submitMarketingApproval
} from "./marketing-approval";
import type { MarketingCycleResult } from "./marketing-cycle";

const context = {
  tenantId: "tenant-a",
  employeeId: "EMP-003" as const,
  workspaceId: "marketing",
  actorId: "emp003",
  channel: "portal",
  correlationId: "corr-003"
};

const cycle: MarketingCycleResult = {
  objective: { id: "obj-1", tenantId: "tenant-a", title: "Grow sales", target: "+25%", budget: 3000, currency: "USD" },
  plan: { id: "plan:obj-1", tenantId: "tenant-a", objectiveId: "obj-1", offeringIds: [], audienceIds: [], publishableClaimIds: [], proposedActions: ["campaign.schedule"] },
  approval: { id: "approval:corr-003:obj-1", tenantId: "tenant-a", employeeId: "EMP-003", correlationId: "corr-003", capabilityId: "campaign.schedule", objectiveId: "obj-1", planId: "plan:obj-1", decision: "REQUIRE_APPROVAL", budget: 3000, currency: "USD" }
};

test("EMP003 submits a YELLOW action to the shared tenant approval inbox", async () => {
  const repository = createInMemoryApprovalRepository();
  const request = await submitMarketingApproval({ context, cycle, repository, now: "2026-09-16T00:00:00Z" });
  assert.equal(request?.status, "PENDING");
  assert.equal((await repository.listPending("tenant-a")).length, 1);
  assert.equal((await repository.listPending("tenant-b")).length, 0);
});

test("approved decision authorizes exact marketing plan and creates correlated audit evidence", async () => {
  const repository = createInMemoryApprovalRepository();
  const request = await submitMarketingApproval({ context, cycle, repository, now: "2026-09-16T00:00:00Z" });
  assert.ok(request);
  const approved = await repository.decide({ tenantId: "tenant-a", approvalId: request.id, actorId: "manager-1", decision: "APPROVE", decidedAt: "2026-09-16T00:05:00Z" });

  assert.doesNotThrow(() => authorizeApprovedMarketingAction({ context, request: approved, planId: cycle.plan.id }));
  const audit = createMarketingApprovalAuditEvent({ context, request: approved });
  assert.equal(audit.tenantId, "tenant-a");
  assert.equal(audit.correlationId, "corr-003");
  assert.equal(audit.outcome, "SUCCESS");
  assert.equal(audit.evidence?.approvalId, request.id);
  assert.equal(audit.evidence?.decidedBy, "manager-1");
});

test("rejected or cross-scope decision cannot authorize execution", async () => {
  const repository = createInMemoryApprovalRepository();
  const request = await submitMarketingApproval({ context, cycle, repository });
  assert.ok(request);
  const rejected = await repository.decide({ tenantId: "tenant-a", approvalId: request.id, actorId: "manager-1", decision: "REJECT" });
  assert.throws(() => authorizeApprovedMarketingAction({ context, request: rejected, planId: cycle.plan.id }), /MARKETING_APPROVAL_NOT_VALID_FOR_ACTION/);

  const forged = { ...rejected, status: "APPROVED" as const };
  assert.throws(() => authorizeApprovedMarketingAction({ context, request: forged, planId: "plan:other" }), /MARKETING_APPROVAL_NOT_VALID_FOR_ACTION/);
});
