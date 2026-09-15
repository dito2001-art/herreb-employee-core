import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseDurableExecutionMode,
  createAdapterRegistry,
  executeCapability,
  parseTenantContext
} from "../core";
import { createCalendarAdapter } from "./calendar";
import { createEmailAdapter } from "./email";

const context = parseTenantContext({
  tenantId: "tenant-a",
  employeeId: "EMP-002",
  workspaceId: "assistant",
  actorId: "tester",
  channel: "test",
  correlationId: "corr-assistant"
});

test("calendar reads execute without approval", async () => {
  let calls = 0;
  const registry = createAdapterRegistry();
  registry.register(
    createCalendarAdapter({
      async execute() {
        calls += 1;
        return { ok: true, output: { events: [] } };
      }
    })
  );

  const result = await executeCapability(registry, {
    context,
    capabilityId: "calendar.read",
    input: {
      operation: "search",
      timeMin: "2026-09-15T00:00:00-03:00",
      timeMax: "2026-09-16T00:00:00-03:00"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});

test("calendar writes require idempotency and approval", async () => {
  let calls = 0;
  const registry = createAdapterRegistry();
  registry.register(
    createCalendarAdapter({
      async execute() {
        calls += 1;
        return { ok: true, output: { eventId: "event-1" } };
      }
    })
  );

  const request = {
    context,
    capabilityId: "calendar.write",
    input: {
      operation: "create" as const,
      title: "Test",
      startTime: "2026-09-16T10:00:00-03:00",
      endTime: "2026-09-16T11:00:00-03:00",
      timezone: "America/Asuncion"
    },
    idempotencyKey: "calendar:create:test-1"
  };

  const blocked = await executeCapability(registry, request);
  assert.equal(blocked.error?.code, "APPROVAL_REQUIRED");
  assert.equal(calls, 0);

  const approved = await executeCapability(registry, request, {
    approvalGranted: true
  });
  assert.equal(approved.ok, true);
  assert.equal(calls, 1);
});

test("email send cannot execute through read capability", async () => {
  let calls = 0;
  const registry = createAdapterRegistry();
  registry.register(
    createEmailAdapter({
      async execute() {
        calls += 1;
        return { ok: true };
      }
    })
  );

  const result = await executeCapability(registry, {
    context,
    capabilityId: "email.read",
    input: {
      operation: "send",
      to: ["person@example.com"],
      subject: "Test",
      body: "Test"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "EMAIL_OPERATION_MISMATCH");
  assert.equal(calls, 0);
});

test("durable routing keeps simple future work on scheduler and complex work on workflows", () => {
  assert.equal(
    chooseDurableExecutionMode({
      employeeId: "EMP-002",
      capabilityId: "task.schedule",
      hasFutureTime: true
    }),
    "SCHEDULE"
  );
  assert.equal(
    chooseDurableExecutionMode({
      employeeId: "EMP-002",
      capabilityId: "email.send",
      multiStep: true,
      waitsForExternalEvent: true
    }),
    "WORKFLOW"
  );
  assert.equal(
    chooseDurableExecutionMode({
      employeeId: "EMP-003",
      capabilityId: "campaign.schedule",
      fanOut: true
    }),
    "QUEUE"
  );
});
