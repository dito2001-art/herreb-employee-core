import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryApprovalRepository } from "./approvals";
import { createInMemoryTenantKnowledgeRepository } from "./knowledge-repository";
import { createMarketingApprovalAuditEvent, submitMarketingApproval } from "./marketing-approval";
import { loadTenantMarketingBrain } from "./marketing-brain-repository";
import { runMarketingPlanningCycle } from "./marketing-cycle";
import {
  authorizeAndReserveApprovedMarketingAction,
  createInMemoryMarketingExecutionReceiptRepository
} from "./marketing-execution-receipt";
import { createInMemoryTenantOfferingRepository } from "./offering-repository";
import { onboardTenantMarketingFoundation } from "./tenant-marketing-foundation";

const tenantId = "herreb-client-0";
const context = {
  tenantId,
  employeeId: "EMP-003" as const,
  workspaceId: "marketing-client0",
  actorId: "emp003",
  channel: "portal",
  correlationId: "corr-client0-e2e-001"
};

test("EMP003 Client0 controlled dry-run reaches approved reserved action with audit evidence", async () => {
  const knowledgeRepository = createInMemoryTenantKnowledgeRepository();
  const offeringRepository = createInMemoryTenantOfferingRepository();
  await onboardTenantMarketingFoundation({
    knowledgeRepository,
    offeringRepository,
    foundation: {
      tenantId,
      knowledge: [{
        id: "k-client0-service",
        tenantId,
        namespace: "marketing",
        kind: "CANONICAL",
        subject: "service:ai-consulting-demo",
        content: { statement: "Synthetic Client0 service fixture for controlled E2E validation." },
        sourceRefs: ["synthetic-client0-e2e"],
        confidence: 1,
        verified: true,
        updatedAt: "2026-09-16T11:00:00Z"
      }],
      offerings: [{
        id: "ai-consulting-demo",
        tenantId,
        type: "SERVICE",
        name: "Synthetic AI Consulting Demo",
        active: true,
        metadata: { fixture: true }
      }]
    }
  });

  const brain = await loadTenantMarketingBrain({ tenantId, knowledgeRepository, offeringRepository });
  assert.deepEqual(brain.offerings.map((item) => item.id), ["ai-consulting-demo"]);

  const cycle = runMarketingPlanningCycle({
    context,
    brain,
    objective: { id: "obj-client0-e2e", tenantId, title: "Validate controlled marketing cycle", target: "dry-run", budget: 100, currency: "USD" },
    executionCapabilityId: "campaign.schedule"
  });
  assert.equal(cycle.approval?.decision, "REQUIRE_APPROVAL");
  assert.deepEqual(cycle.plan.offeringIds, ["ai-consulting-demo"]);

  const approvals = createInMemoryApprovalRepository();
  const pending = await submitMarketingApproval({ context, cycle, repository: approvals, now: "2026-09-16T11:01:00Z" });
  assert.ok(pending);
  const approved = await approvals.decide({ tenantId, approvalId: pending.id, actorId: "manager-client0", decision: "APPROVE", decidedAt: "2026-09-16T11:02:00Z" });

  const receipts = createInMemoryMarketingExecutionReceiptRepository();
  const receipt = await authorizeAndReserveApprovedMarketingAction({ context, request: approved, planId: cycle.plan.id, capabilityId: "campaign.schedule", repository: receipts, now: "2026-09-16T11:03:00Z" });
  assert.equal(receipt.tenantId, tenantId);
  assert.equal(receipt.correlationId, context.correlationId);
  assert.equal(receipt.capabilityId, "campaign.schedule");

  const audit = createMarketingApprovalAuditEvent({ context, request: approved });
  assert.equal(audit.tenantId, tenantId);
  assert.equal(audit.correlationId, context.correlationId);
  assert.equal(audit.outcome, "SUCCESS");
  assert.equal(audit.evidence?.approvalId, approved.id);

  await assert.rejects(
    authorizeAndReserveApprovedMarketingAction({ context, request: approved, planId: cycle.plan.id, capabilityId: "campaign.schedule", repository: receipts }),
    /MARKETING_ACTION_ALREADY_RESERVED/
  );
});

test("EMP003 Client0 dry-run fails closed when execution context crosses tenant boundary", async () => {
  const approvals = createInMemoryApprovalRepository();
  const cycle = {
    objective: { id: "obj-negative", tenantId, title: "Negative scope", target: "reject" },
    plan: { id: "plan:obj-negative", tenantId, objectiveId: "obj-negative", offeringIds: [], audienceIds: [], publishableClaimIds: [], proposedActions: ["campaign.schedule"] },
    approval: { id: "approval:corr-client0-e2e-001:obj-negative", tenantId, employeeId: "EMP-003" as const, correlationId: context.correlationId, capabilityId: "campaign.schedule", objectiveId: "obj-negative", planId: "plan:obj-negative", decision: "REQUIRE_APPROVAL" as const }
  };
  const pending = await submitMarketingApproval({ context, cycle, repository: approvals });
  assert.ok(pending);
  const approved = await approvals.decide({ tenantId, approvalId: pending.id, actorId: "manager-client0", decision: "APPROVE" });
  await assert.rejects(
    authorizeAndReserveApprovedMarketingAction({ context: { ...context, tenantId: "tenant-b" }, request: approved, planId: cycle.plan.id, capabilityId: "campaign.schedule", repository: createInMemoryMarketingExecutionReceiptRepository() }),
    /MARKETING_APPROVAL_NOT_VALID_FOR_ACTION/
  );
});
