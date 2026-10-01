import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarTransport } from "../adapters/calendar";
import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";
import { executeConfirmSlotCommands } from "./emp002-confirm-slot-executor";

const calendar: CalendarTransport = {
  async execute(input) {
    assert.equal(input.idempotencyKey, "confirm:recovery-1:req-1");
    assert.equal(input.request.operation, "create");
    return {
      ok: true,
      output: { eventId: "gcal-event-1" },
      evidence: { upstreamStatus: 200 }
    };
  }
};

const state: AutonomousSchedulingState = {
  tenantId: "tenant-a",
  correlationId: "corr-1",
  goal: {
    id: "goal-1",
    tenantId: "tenant-a",
    contactId: "contact-1",
    kind: "WAITLIST_SLOT",
    status: "WAITING_FOR_EXECUTION",
    objective: "fill slot",
    confirmedFacts: {},
    nextBestAction: "CONFIRM_APPOINTMENT_AND_CLOSE_WAITLIST",
    createdAt: "2026-10-01T12:00:00-03:00",
    updatedAt: "2026-10-01T12:10:00-03:00",
    correlationId: "corr-1"
  }
};

describe("EMP-002 confirm slot executor", () => {
  it("creates the accepted slot through controlled Calendar write", async () => {
    const executions = await executeConfirmSlotCommands({
      tenantId: "tenant-a",
      correlationId: "corr-1",
      timezone: "America/Asuncion",
      calendar,
      contacts: {
        "contact-1": {
          id: "contact-1",
          displayName: "Ana",
          email: "ana@example.com"
        }
      },
      result: {
        state,
        commands: [
          {
            type: "CONFIRM_SLOT",
            idempotencyKey: "confirm:recovery-1:req-1",
            requestId: "req-1",
            contactId: "contact-1",
            slot: {
              tenantId: "tenant-a",
              resourceId: "resource-1",
              startsAt: "2026-10-02T10:00:00-03:00",
              endsAt: "2026-10-02T10:30:00-03:00"
            }
          }
        ]
      }
    });
    assert.deepEqual(executions, [
      {
        commandType: "CONFIRM_SLOT",
        idempotencyKey: "confirm:recovery-1:req-1",
        ok: true,
        eventId: "gcal-event-1",
        upstreamStatus: 200
      }
    ]);
  });
});
