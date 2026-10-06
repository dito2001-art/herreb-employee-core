import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "./contracts";
import type { DurableJob } from "./durable";
import {
  createInMemorySalesStateRepository,
  markSalesActionExecuted,
  scheduleSalesFollowup
} from "./sales-state";

const context: TenantContext = {
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "owner",
  channel: "runtime",
  correlationId: "corr-sales-state"
};

const lead = {
  id: "lead-1",
  tenantId: "tenant-a",
  source: "DATABASE" as const,
  contactKey: "595981000000",
  qualified: true
};

test("sales state is isolated by tenant", async () => {
  const repository = createInMemorySalesStateRepository();
  await repository.put("tenant-a", lead);
  assert.equal((await repository.list("tenant-a")).length, 1);
  assert.equal((await repository.list("tenant-b")).length, 0);
  await assert.rejects(
    repository.put("tenant-b", lead),
    /SALES_STATE_TENANT_MISMATCH/
  );
});

test("successful action persists execution state deterministically", async () => {
  const repository = createInMemorySalesStateRepository();
  const next = await markSalesActionExecuted({
    repository,
    tenantId: "tenant-a",
    lead,
    idempotencyKey: "emp001:tenant-a:outreach:lead-1:whatsapp",
    executedAt: "2026-09-15T20:00:00Z",
    nextFollowupAt: "2026-09-17T20:00:00Z"
  });
  assert.equal(next.contacted, true);
  assert.equal(next.followupDue, false);
  assert.equal(next.nextFollowupAt, "2026-09-17T20:00:00Z");
  assert.equal(
    (await repository.get("tenant-a", "lead-1"))?.lastExecutionKey,
    "emp001:tenant-a:outreach:lead-1:whatsapp"
  );
});

test("followup scheduling preserves tenant, time and idempotency", async () => {
  let captured: DurableJob | undefined;
  const result = await scheduleSalesFollowup({
    context,
    lead,
    notBefore: "2026-09-17T20:00:00Z",
    idempotencyKey: "followup-key",
    dispatcher: {
      async dispatch(job) {
        captured = job;
        return {
          accepted: true,
          mode: "SCHEDULE",
          executionId: "schedule-1",
          reason: "ACCEPTED"
        };
      }
    }
  });
  assert.equal(result.accepted, true);
  assert.equal(captured?.context.tenantId, "tenant-a");
  assert.equal(captured?.notBefore, "2026-09-17T20:00:00Z");
  assert.equal(captured?.idempotencyKey, "followup-key");
  assert.equal(captured?.requiresApproval, true);
});

test("cross tenant followup fails before dispatcher", async () => {
  let calls = 0;
  await assert.rejects(
    scheduleSalesFollowup({
      context,
      lead: { ...lead, tenantId: "tenant-b" },
      notBefore: "2026-09-17T20:00:00Z",
      idempotencyKey: "wrong-tenant",
      dispatcher: {
        async dispatch() {
          calls += 1;
          return { accepted: true, mode: "SCHEDULE", reason: "ACCEPTED" };
        }
      }
    }),
    /SALES_STATE_TENANT_MISMATCH/
  );
  assert.equal(calls, 0);
});
