import { describe, expect, it } from "vitest";
import { advanceWaitlistGoal, createWaitlistGoal } from "./emp002-cognitive-scheduling";

describe("EMP-002 cognitive scheduling goals", () => {
  it("turns a natural-language objective into persistent structured facts", () => {
    const goal = createWaitlistGoal({
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
    expect(goal.status).toBe("WAITING_FOR_TRIGGER");
    expect(goal.nextBestAction).toBe("WAIT_FOR_COMPATIBLE_SLOT");
    expect(goal.confirmedFacts.resourceId).toBe("doctor-1");
    expect(goal.waitlist?.timeWindows?.[0]).toEqual({ from: "16:00", to: "23:59" });
  });

  it("preserves confirmed facts while next-best-action advances", () => {
    const initial = createWaitlistGoal({
      id: "goal-1", tenantId: "herreb-client-0", contactId: "patient-1",
      objective: "Avisame si se libera algo este martes después de las 16",
      dateFrom: "2026-09-22T00:00:00-03:00", dateTo: "2026-09-22T23:59:59-03:00",
      timeWindows: [{ from: "16:00", to: "23:59" }], durationMinutes: 60,
      expiresAt: "2026-09-23T00:00:00-03:00", now: "2026-09-16T18:00:00-03:00", correlationId: "corr-goal-1"
    });
    const matched = advanceWaitlistGoal(initial, "SLOT_MATCHED", "2026-09-20T12:00:00-03:00");
    const offered = advanceWaitlistGoal(matched, "OFFER_SENT", "2026-09-20T12:01:00-03:00");
    const accepted = advanceWaitlistGoal(offered, "OFFER_ACCEPTED", "2026-09-20T12:05:00-03:00");
    expect(matched.nextBestAction).toBe("OFFER_COMPATIBLE_SLOT");
    expect(offered.status).toBe("WAITING_FOR_CONTACT");
    expect(accepted.status).toBe("COMPLETED");
    expect(accepted.confirmedFacts).toEqual(initial.confirmedFacts);
    expect(accepted.objective).toBe(initial.objective);
    expect(accepted.correlationId).toBe("corr-goal-1");
  });

  it("returns to waiting after a declined offer without losing the objective", () => {
    const initial = createWaitlistGoal({
      id: "goal-2", tenantId: "herreb-client-0", contactId: "patient-2", objective: "Avisame si aparece otro turno esta semana",
      dateFrom: "2026-09-16T00:00:00-03:00", dateTo: "2026-09-20T23:59:59-03:00", durationMinutes: 30,
      expiresAt: "2026-09-21T00:00:00-03:00", now: "2026-09-16T18:00:00-03:00", correlationId: "corr-goal-2"
    });
    const declined = advanceWaitlistGoal(advanceWaitlistGoal(initial, "SLOT_MATCHED", "2026-09-17T10:00:00-03:00"), "OFFER_DECLINED", "2026-09-17T10:05:00-03:00");
    expect(declined.status).toBe("WAITING_FOR_TRIGGER");
    expect(declined.objective).toBe(initial.objective);
    expect(declined.nextBestAction).toBe("WAIT_FOR_COMPATIBLE_SLOT");
  });
});
