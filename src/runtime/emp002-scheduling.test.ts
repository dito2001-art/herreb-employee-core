import { describe, expect, it } from "vitest";
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

describe("EMP-002 waitlist matching", () => {
  it("matches a requested Tuesday slot after 16:00", () => {
    expect(isWaitlistRequestEligible(base, slot, "2026-09-20T12:00:00-03:00")).toBe(true);
  });

  it("rejects an incompatible resource", () => {
    expect(
      isWaitlistRequestEligible(base, { ...slot, resourceId: "doctor-2" }, "2026-09-20T12:00:00-03:00")
    ).toBe(false);
  });

  it("rejects a slot outside the requested time window", () => {
    expect(
      isWaitlistRequestEligible(
        base,
        { ...slot, startsAt: "2026-09-22T10:00:00-03:00", endsAt: "2026-09-22T11:00:00-03:00" },
        "2026-09-20T12:00:00-03:00"
      )
    ).toBe(false);
  });

  it("rejects expired requests", () => {
    expect(isWaitlistRequestEligible(base, slot, "2026-09-23T01:00:00-03:00")).toBe(false);
  });

  it("orders eligible requests by priority then age", () => {
    const lowerPriority = { ...base, id: "wait-2", priority: 5, createdAt: "2026-09-15T10:00:00-03:00" };
    const samePriorityOlder = { ...base, id: "wait-3", createdAt: "2026-09-15T09:00:00-03:00" };
    expect(matchWaitlist([base, lowerPriority, samePriorityOlder], slot, "2026-09-20T12:00:00-03:00").map((m) => m.request.id)).toEqual([
      "wait-3",
      "wait-1",
      "wait-2"
    ]);
  });
});
