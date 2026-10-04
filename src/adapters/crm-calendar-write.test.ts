import assert from "node:assert/strict";
import test from "node:test";
import type { CrmTransport } from "./crm";
import { createCrmCalendarControlledWriteTransport } from "./crm-calendar-write";

function transport(calls: Array<Record<string, unknown>>): CrmTransport {
  return {
    async execute(input) {
      calls.push(input as unknown as Record<string, unknown>);
      return { ok: true, output: { persisted: true, id: "task-1" } };
    }
  };
}

test("EMP-002 calendar create becomes idempotent CRM task create", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const calendar = createCrmCalendarControlledWriteTransport(transport(calls));
  const result = await calendar.execute({
    tenantId: "tenant-a",
    correlationId: "corr-1",
    idempotencyKey: "calendar:create:task-1",
    request: {
      operation: "create",
      title: "Presentación",
      startTime: "2026-10-05T15:00:00-03:00",
      endTime: "2026-10-05T16:00:00-03:00",
      timezone: "America/Asuncion",
      attendees: ["client@example.com"]
    }
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.operation, "create");
  assert.equal(calls[0]?.entity, "tasks");
  assert.equal(calls[0]?.idempotencyKey, "calendar:create:task-1");
});

test("EMP-002 calendar update preserves event id for CRM mutation", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const calendar = createCrmCalendarControlledWriteTransport(transport(calls));
  await calendar.execute({
    tenantId: "tenant-a",
    correlationId: "corr-2",
    idempotencyKey: "calendar:update:task-1",
    request: { operation: "update", eventId: "task-1", changes: { startTime: "2026-10-06T11:00:00-03:00" } }
  });
  assert.deepEqual(calls[0]?.payload, { id: "task-1", startTime: "2026-10-06T11:00:00-03:00" });
});

test("EMP-002 calendar controlled write refuses missing idempotency key", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const calendar = createCrmCalendarControlledWriteTransport(transport(calls));
  const result = await calendar.execute({
    tenantId: "tenant-a",
    correlationId: "corr-3",
    request: { operation: "delete", eventId: "task-1" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "CRM_CALENDAR_IDEMPOTENCY_REQUIRED");
  assert.equal(calls.length, 0);
});
