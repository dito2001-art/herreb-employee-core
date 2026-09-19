import assert from "node:assert/strict";
import test from "node:test";
import { reduceAutonomousScheduling } from "./emp002-autonomous-scheduling";
import { createWaitlistGoal } from "./emp002-cognitive-scheduling";
import type { WaitlistRequest } from "./emp002-scheduling";

function goal() {
  return createWaitlistGoal({
    id: "goal-1",
    tenantId: "herreb-client-0",
    contactId: "patient-1",
    objective: "Avisame si se libera algo el martes después de las 16",
    resourceId: "doctor-1",
    dateFrom: "2026-09-22T00:00:00-03:00",
    dateTo: "2026-09-22T23:59:59-03:00",
    timeWindows: [{ from: "16:00", to: "23:59" }],
    durationMinutes: 60,
    expiresAt: "2026-09-23T00:00:00-03:00",
    now: "2026-09-16T18:00:00-03:00",
    correlationId: "corr-1"
  });
}

function request(
  id: string,
  contactId: string,
  priority: number
): WaitlistRequest {
  return {
    id,
    tenantId: "herreb-client-0",
    contactId,
    resourceId: "doctor-1",
    dateFrom: "2026-09-22T00:00:00-03:00",
    dateTo: "2026-09-22T23:59:59-03:00",
    timeWindows: [{ from: "16:00", to: "23:59" }],
    durationMinutes: 60,
    priority,
    status: "WAITING",
    expiresAt: "2026-09-23T00:00:00-03:00",
    createdAt: "2026-09-16T10:00:00-03:00",
    correlationId: `corr-${id}`
  };
}

const slot = {
  tenantId: "herreb-client-0",
  resourceId: "doctor-1",
  startsAt: "2026-09-22T17:00:00-03:00",
  endsAt: "2026-09-22T18:00:00-03:00"
};

test("EMP-002 turns a released slot into the next autonomous offer command", () => {
  const requests = [request("wait-1", "patient-1", 10)];
  const result = reduceAutonomousScheduling(
    { tenantId: "herreb-client-0", correlationId: "corr-1", goal: goal() },
    { type: "SLOT_RELEASED", slot, requests, now: "2026-09-20T12:00:00-03:00" }
  );
  assert.equal(result.state.goal.nextBestAction, "OFFER_COMPATIBLE_SLOT");
  assert.deepEqual(result.commands[0], {
    type: "SEND_SLOT_OFFER",
    idempotencyKey:
      "herreb-client-0:doctor-1:2026-09-22T17:00:00-03:00:2026-09-22T18:00:00-03:00:offer:wait-1",
    contactId: "patient-1",
    requestId: "wait-1",
    expiresAt: "2026-09-20T15:15:00.000Z"
  });
});

test("EMP-002 continues autonomously with the next candidate after decline", () => {
  const requests = [
    request("first", "patient-1", 10),
    request("second", "patient-2", 5)
  ];
  const released = reduceAutonomousScheduling(
    { tenantId: "herreb-client-0", correlationId: "corr-1", goal: goal() },
    { type: "SLOT_RELEASED", slot, requests, now: "2026-09-20T12:00:00-03:00" }
  );
  const sent = reduceAutonomousScheduling(released.state, {
    type: "OFFER_SENT",
    now: "2026-09-20T12:01:00-03:00"
  });
  const declined = reduceAutonomousScheduling(sent.state, {
    type: "CONTACT_DECLINED",
    requests,
    now: "2026-09-20T12:05:00-03:00"
  });
  assert.equal(declined.commands[0]?.type, "SEND_SLOT_OFFER");
  assert.equal(
    declined.commands[0]?.type === "SEND_SLOT_OFFER"
      ? declined.commands[0].contactId
      : undefined,
    "patient-2"
  );
  assert.equal(declined.state.goal.status, "WAITING_FOR_TRIGGER");
});

test("EMP-002 produces confirmation after acceptance and completes the goal", () => {
  const requests = [request("winner", "patient-1", 10)];
  const released = reduceAutonomousScheduling(
    { tenantId: "herreb-client-0", correlationId: "corr-1", goal: goal() },
    { type: "SLOT_RELEASED", slot, requests, now: "2026-09-20T12:00:00-03:00" }
  );
  const sent = reduceAutonomousScheduling(released.state, {
    type: "OFFER_SENT",
    now: "2026-09-20T12:01:00-03:00"
  });
  const accepted = reduceAutonomousScheduling(sent.state, {
    type: "CONTACT_ACCEPTED",
    requests,
    now: "2026-09-20T12:05:00-03:00"
  });
  assert.equal(accepted.state.goal.status, "WAITING_FOR_EXECUTION");
  assert.deepEqual(accepted.commands[0], {
    type: "CONFIRM_SLOT",
    idempotencyKey:
      "herreb-client-0:doctor-1:2026-09-22T17:00:00-03:00:2026-09-22T18:00:00-03:00:confirm:winner",
    requestId: "winner",
    slot
  });
  const verified = reduceAutonomousScheduling(accepted.state, {
    type: "CONFIRMATION_VERIFIED",
    now: "2026-09-20T12:06:00-03:00"
  });
  assert.equal(verified.state.goal.status, "COMPLETED");
});

test("EMP-002 fails closed on tenant mismatch", () => {
  assert.throws(
    () =>
      reduceAutonomousScheduling(
        { tenantId: "other-tenant", correlationId: "corr-1", goal: goal() },
        {
          type: "SLOT_RELEASED",
          slot,
          requests: [],
          now: "2026-09-20T12:00:00-03:00"
        }
      ),
    /EMP002_SCHEDULING_TENANT_MISMATCH/
  );
});
