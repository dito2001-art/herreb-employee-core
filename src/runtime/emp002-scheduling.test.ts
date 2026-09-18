import assert from "node:assert/strict";
import test from "node:test";
import {
  isWaitlistRequestEligible,
  matchWaitlist,
  type AvailableSlot,
  type WaitlistRequest
} from "./emp002-scheduling";

const base: WaitlistRequest = {
  id: "wait-1",
  tenantId: "herreb-client-0",
  contactId: "contact-1",
  resourceId: "doctor-1",
  serviceId: "consultation",
  dateFrom: "2026-09-22T00:00:00-03:00",
  dateTo: "2026-09-22T23:59:59-03:00",
  timeWindows: [{ from: "16:00", to: "20:00" }],
  durationMinutes: 60,
  priority: 10,
  status: "WAITING",
  expiresAt: "2026-09-23T00:00:00-03:00",
  createdAt: "2026-09-16T10:00:00-03:00",
  correlationId: "corr-wait-1"
};

const slot: AvailableSlot = {
  resourceId: "doctor-1",
  serviceId: "consultation",
  startsAt: "2026-09-22T17:00:00-03:00",
  endsAt: "2026-09-22T18:00:00-03:00"
};

test("EMP-002 matches a requested Tuesday slot after 16:00", () => {
  assert.equal(isWaitlistRequestEligible(base, slot, "2026-09-20T12:00:00-03:00"), true);
});

test("EMP-002 rejects an incompatible resource", () => {
  assert.equal(
    isWaitlistRequestEligible(
      base,
      { ...slot, resourceId: "doctor-2" },
      "2026-09-20T12:00:00-03:00"
    ),
    false
  );
});

test("EMP-002 rejects a slot outside the requested time window", () => {
  assert.equal(
    isWaitlistRequestEligible(
      base,
      {
        ...slot,
        startsAt: "2026-09-22T10:00:00-03:00",
        endsAt: "2026-09-22T11:00:00-03:00"
      },
      "2026-09-20T12:00:00-03:00"
    ),
    false
  );
});

test("EMP-002 rejects expired requests", () => {
  assert.equal(isWaitlistRequestEligible(base, slot, "2026-09-23T01:00:00-03:00"), false);
});

test("EMP-002 orders eligible requests by priority then age", () => {
  const lowerPriority = {
    ...base,
    id: "wait-2",
    priority: 5,
    createdAt: "2026-09-15T10:00:00-03:00"
  };
  const samePriorityOlder = {
    ...base,
    id: "wait-3",
    createdAt: "2026-09-15T09:00:00-03:00"
  };
  assert.deepEqual(
    matchWaitlist(
      [base, lowerPriority, samePriorityOlder],
      slot,
      "2026-09-20T12:00:00-03:00"
    ).map((match) => match.request.id),
    ["wait-3", "wait-1", "wait-2"]
  );
});
