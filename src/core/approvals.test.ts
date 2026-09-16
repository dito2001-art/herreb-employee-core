import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryApprovalRepository, isApprovalValidForAction } from "./approvals";

const pending = (tenantId = "tenant-a") => ({
  id: "approval-1",
  tenantId,
  employeeId: "EMP-003" as const,
  correlationId: "corr-1",
  capabilityId: "campaign.schedule",
  actorId: "emp003",
  subjectId: "plan:obj-1",
  summary: "Schedule campaign",
  status: "PENDING" as const,
  requestedAt: "2026-09-16T00:00:00Z"
});

test("approval inbox is tenant isolated", async () => {
  const repository = createInMemoryApprovalRepository();
  await repository.put("tenant-a", pending());
  assert.equal((await repository.listPending("tenant-a")).length, 1);
  assert.equal((await repository.listPending("tenant-b")).length, 0);
  await assert.rejects(repository.put("tenant-b", pending("tenant-a")), /APPROVAL_TENANT_ISOLATION_VIOLATION/);
});

test("approved request authorizes only its exact tenant employee correlation capability and subject", async () => {
  const repository = createInMemoryApprovalRepository();
  await repository.put("tenant-a", pending());
  const approved = await repository.decide({
    tenantId: "tenant-a",
    approvalId: "approval-1",
    actorId: "client-user",
    decision: "APPROVE",
    decidedAt: "2026-09-16T01:00:00Z"
  });

  assert.equal(
    isApprovalValidForAction({
      request: approved,
      tenantId: "tenant-a",
      employeeId: "EMP-003",
      correlationId: "corr-1",
      capabilityId: "campaign.schedule",
      subjectId: "plan:obj-1"
    }),
    true
  );
  assert.equal(
    isApprovalValidForAction({
      request: approved,
      tenantId: "tenant-b",
      employeeId: "EMP-003",
      correlationId: "corr-1",
      capabilityId: "campaign.schedule",
      subjectId: "plan:obj-1"
    }),
    false
  );
  assert.equal(
    isApprovalValidForAction({
      request: approved,
      tenantId: "tenant-a",
      employeeId: "EMP-003",
      correlationId: "corr-other",
      capabilityId: "campaign.schedule",
      subjectId: "plan:obj-1"
    }),
    false
  );
});

test("rejected or already decided approvals fail closed", async () => {
  const repository = createInMemoryApprovalRepository();
  await repository.put("tenant-a", pending());
  const rejected = await repository.decide({
    tenantId: "tenant-a",
    approvalId: "approval-1",
    actorId: "client-user",
    decision: "REJECT"
  });
  assert.equal(
    isApprovalValidForAction({
      request: rejected,
      tenantId: "tenant-a",
      employeeId: "EMP-003",
      correlationId: "corr-1",
      capabilityId: "campaign.schedule",
      subjectId: "plan:obj-1"
    }),
    false
  );
  await assert.rejects(
    repository.decide({ tenantId: "tenant-a", approvalId: "approval-1", actorId: "client-user", decision: "APPROVE" }),
    /APPROVAL_ALREADY_DECIDED/
  );
});
