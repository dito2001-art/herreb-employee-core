import assert from "node:assert/strict";
import test from "node:test";
import { createAdapterRegistry } from "./adapters";
import type { TenantContext } from "./contracts";
import type { ProactiveSalesPolicy } from "./proactive-sales";
import { executeSalesCycle } from "./sales-cycle";
import { createInMemorySalesLoopExecutionStore } from "./sales-loop-executor";
import { createInMemorySalesStateRepository } from "./sales-state";

const context: TenantContext = {
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "owner",
  channel: "runtime",
  correlationId: "corr-sales-cycle"
};

const policy: ProactiveSalesPolicy = {
  tenantId: "tenant-a",
  mode: "ACTIVE",
  channels: ["WHATSAPP"],
  allowLeadDiscovery: true,
  allowDatabaseSelling: true,
  allowAutonomousOutreach: true,
  allowAutonomousFollowup: true,
  maxTouchesPerLeadPerDay: 3,
  maxTouchesPerLeadPerWeek: 7,
  suppressionList: []
};

const authorization = {
  approvalGranted: true,
  controlledWriteAuthorization: {
    authorized: true,
    tenantId: "tenant-a",
    subjectId: "owner",
    assurance: "test",
    source: "trusted-test"
  }
};

test("sales cycle persists successful outreach and schedules a controlled followup", async () => {
  const registry = createAdapterRegistry();
  registry.register({
    id: "mock-whatsapp",
    capabilities: ["whatsapp.send"],
    employees: ["EMP-001"],
    async execute() {
      return { ok: true, output: { messageId: "wamid.mock" } };
    }
  });
  const stateRepository = createInMemorySalesStateRepository();
  await stateRepository.put("tenant-a", {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true
  });
  let dispatched = 0;
  const result = await executeSalesCycle({
    context,
    policy,
    registry,
    executionStore: createInMemorySalesLoopExecutionStore(),
    stateRepository,
    executeOptions: authorization,
    now: "2026-09-15T22:00:00Z",
    followupAt: "2026-09-17T22:00:00Z",
    dispatcher: {
      async dispatch(job) {
        dispatched += 1;
        assert.equal(job.capabilityId, "followup.schedule");
        assert.equal(job.context.tenantId, "tenant-a");
        assert.equal(job.requiresApproval, true);
        return {
          accepted: true,
          mode: "SCHEDULE",
          executionId: "schedule-1",
          reason: "ACCEPTED"
        };
      }
    }
  });

  assert.equal(result.execution.executed, true);
  assert.equal(result.persistedLead?.contacted, true);
  assert.equal(result.persistedLead?.nextFollowupAt, "2026-09-17T22:00:00Z");
  assert.equal(result.followupScheduled, true);
  assert.equal(dispatched, 1);
});

test("failed or unauthorized outreach never mutates sales state or schedules followup", async () => {
  const registry = createAdapterRegistry();
  let adapterCalls = 0;
  registry.register({
    id: "mock-whatsapp",
    capabilities: ["whatsapp.send"],
    employees: ["EMP-001"],
    async execute() {
      adapterCalls += 1;
      return { ok: true };
    }
  });
  const stateRepository = createInMemorySalesStateRepository();
  await stateRepository.put("tenant-a", {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true
  });
  let dispatched = 0;
  const result = await executeSalesCycle({
    context,
    policy,
    registry,
    executionStore: createInMemorySalesLoopExecutionStore(),
    stateRepository,
    followupAt: "2026-09-17T22:00:00Z",
    dispatcher: {
      async dispatch() {
        dispatched += 1;
        return { accepted: true, mode: "SCHEDULE", reason: "ACCEPTED" };
      }
    }
  });

  assert.equal(result.execution.executed, false);
  assert.equal(result.execution.reason, "APPROVAL_REQUIRED");
  assert.equal(adapterCalls, 0);
  assert.equal(dispatched, 0);
  assert.equal(
    (await stateRepository.get("tenant-a", "lead-1"))?.contacted,
    undefined
  );
});

test("paused sales cycle performs no adapter call, persistence mutation or scheduling", async () => {
  const registry = createAdapterRegistry();
  let adapterCalls = 0;
  registry.register({
    id: "mock-whatsapp",
    capabilities: ["whatsapp.send"],
    employees: ["EMP-001"],
    async execute() {
      adapterCalls += 1;
      return { ok: true };
    }
  });
  const stateRepository = createInMemorySalesStateRepository();
  await stateRepository.put("tenant-a", {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true
  });
  const result = await executeSalesCycle({
    context,
    policy: { ...policy, mode: "PAUSED" },
    registry,
    executionStore: createInMemorySalesLoopExecutionStore(),
    stateRepository,
    executeOptions: authorization
  });

  assert.equal(result.execution.executed, false);
  assert.equal(result.execution.reason, "SALES_PAUSED");
  assert.equal(adapterCalls, 0);
  assert.equal(
    (await stateRepository.get("tenant-a", "lead-1"))?.contacted,
    undefined
  );
});
