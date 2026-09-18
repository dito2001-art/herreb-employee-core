import assert from "node:assert/strict";
import test from "node:test";
import { advanceWaitlistGoal, createWaitlistGoal } from "./emp002-cognitive-scheduling";

function baseGoal() {
  return createWaitlistGoal({
    id: "goal-1",
    tenantId: "herreb-client-0",
    contactId: "patient-1",
    objective: "Avisame si se libera algo este martes después de las 16",
    resourceId: "doctor-1",
    dateFrom: "2026-09-22T00:00:00-03:00",
    dateTo: "2026-09-22T23:59:59-03:00",
    timeWindows: [{ from: "16:00", to: "23:59" }],
    durationMinutes: 60,
    expiresAt: "2026-09-23T00:00:00-03:00",
    now: "2026-09-16T18:00:00-03:00",
    correlationId: "corr-goal-1"
  });
}

test("EMP-002 turns a natural-language objective into persistent structured facts", () => {
  const goal = baseGoal();
  assert.equal(goal.status, "WAITING_FOR_TRIGGER");
  assert.equal(goal.nextBestAction, "WAIT_FOR_COMPATIBLE_SLOT");
  assert.equal(goal.confirmedFacts.resourceId, "doctor-1");
  assert.deepEqual(goal.waitlist?.timeWindows?.[0], { from: "16:00", to: "23:59" });
});

test("EMP-002 preserves confirmed facts while next-best-action advances", () => {
  const initial = baseGoal();
  const matched = advanceWaitlistGoal(initial, "SLOT_MATCHED", "2026-09-20T12:00:00-03:00");
  const offered = advanceWaitlistGoal(matched, "OFFER_SENT", "2026-09-20T12:01:00-03:00");
  const accepted = advanceWaitlistGoal(
    offered,
    "OFFER_ACCEPTED",
    "2026-09-20T12:05:00-03:00"
  );
  assert.equal(matched.nextBestAction, "OFFER_COMPATIBLE_SLOT");
  assert.equal(offered.status, "WAITING_FOR_CONTACT");
  assert.equal(accepted.status, "WAITING_FOR_EXECUTION");
  const verified = advanceWaitlistGoal(
    accepted,
    "EXECUTION_VERIFIED",
    "2026-09-20T12:06:00-03:00"
  );
  assert.equal(verified.status, "COMPLETED");
  assert.deepEqual(accepted.confirmedFacts, initial.confirmedFacts);
  assert.equal(accepted.objective, initial.objective);
  assert.equal(accepted.correlationId, "corr-goal-1");
});

test("EMP-002 returns to waiting after decline without losing the objective", () => {
  const initial = createWaitlistGoal({
    id: "goal-2",
    tenantId: "herreb-client-0",
    contactId: "patient-2",
    objective: "Avisame si aparece otro turno esta semana",
    dateFrom: "2026-09-16T00:00:00-03:00",
    dateTo: "2026-09-20T23:59:59-03:00",
    durationMinutes: 30,
    expiresAt: "2026-09-21T00:00:00-03:00",
    now: "2026-09-16T18:00:00-03:00",
    correlationId: "corr-goal-2"
  });
  const matched = advanceWaitlistGoal(initial, "SLOT_MATCHED", "2026-09-17T10:00:00-03:00");
  const declined = advanceWaitlistGoal(
    matched,
    "OFFER_DECLINED",
    "2026-09-17T10:05:00-03:00"
  );
  assert.equal(declined.status, "WAITING_FOR_TRIGGER");
  assert.equal(declined.objective, initial.objective);
  assert.equal(declined.nextBestAction, "WAIT_FOR_COMPATIBLE_SLOT");
});
