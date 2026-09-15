import assert from "node:assert/strict";
import test from "node:test";
import { createEmp001WhatsAppAdapter } from "../adapters/emp001-whatsapp";
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
  correlationId: "corr-e2e-sales"
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

test("EMP001 simulated E2E sends once, persists state, schedules followup and suppresses duplicate", async () => {
  const registry = createAdapterRegistry();
  const sent: Array<{ tenantId: string; correlationId: string; key: string; to: string }> = [];
  registry.register(
    createEmp001WhatsAppAdapter({
      async send(input) {
        sent.push({
          tenantId: input.tenantId,
          correlationId: input.correlationId,
          key: input.idempotencyKey,
          to: input.to
        });
        return {
          ok: true,
          output: { messageId: "wamid.e2e.mock", provider: "mock-meta", status: "SENT" },
          evidence: { upstreamStatus: 200 }
        };
      }
    })
  );

  const stateRepository = createInMemorySalesStateRepository();
  await stateRepository.put("tenant-a", {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true
  });
  const executionStore = createInMemorySalesLoopExecutionStore();
  const scheduled: string[] = [];
  const dispatcher = {
    async dispatch(job: { idempotencyKey: string }) {
      scheduled.push(job.idempotencyKey);
      return {
        accepted: true,
        mode: "SCHEDULE" as const,
        executionId: "schedule-e2e-1",
        reason: "ACCEPTED"
      };
    }
  };

  const first = await executeSalesCycle({
    context,
    policy,
    registry,
    executionStore,
    stateRepository,
    executeOptions: authorization,
    now: "2026-09-15T22:00:00Z",
    followupAt: "2026-09-17T22:00:00Z",
    dispatcher
  });

  assert.equal(first.execution.executed, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.tenantId, "tenant-a");
  assert.equal(sent[0]?.correlationId, "corr-e2e-sales");
  assert.equal(sent[0]?.to, "595981000000");
  assert.equal(first.persistedLead?.contacted, true);
  assert.equal(first.persistedLead?.nextFollowupAt, "2026-09-17T22:00:00Z");
  assert.equal(scheduled.length, 1);

  const second = await executeSalesCycle({
    context,
    policy,
    registry,
    executionStore,
    stateRepository,
    executeOptions: authorization,
    now: "2026-09-15T22:01:00Z",
    followupAt: "2026-09-17T22:00:00Z",
    dispatcher
  });

  assert.equal(second.execution.executed, false);
  assert.equal(sent.length, 1);
  assert.equal(scheduled.length, 1);
});

test("EMP001 simulated E2E fails closed across tenants before WhatsApp or scheduling", async () => {
  const registry = createAdapterRegistry();
  let sends = 0;
  let schedules = 0;
  registry.register(
    createEmp001WhatsAppAdapter({
      async send() {
        sends += 1;
        return { ok: true };
      }
    })
  );
  const stateRepository = createInMemorySalesStateRepository();
  await stateRepository.put("tenant-a", {
    id: "lead-a",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true
  });

  const result = await executeSalesCycle({
    context: { ...context, tenantId: "tenant-b" },
    policy,
    registry,
    executionStore: createInMemorySalesLoopExecutionStore(),
    stateRepository,
    executeOptions: authorization,
    followupAt: "2026-09-17T22:00:00Z",
    dispatcher: {
      async dispatch() {
        schedules += 1;
        return { accepted: true, mode: "SCHEDULE", reason: "ACCEPTED" };
      }
    }
  });

  assert.equal(result.execution.executed, false);
  assert.equal(result.execution.reason, "TENANT_MISMATCH");
  assert.equal(sends, 0);
  assert.equal(schedules, 0);
});
