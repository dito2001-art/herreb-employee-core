import { describe, expect, it } from "vitest";
import { createWaitlistGoal } from "./emp002-cognitive-scheduling";
import { reduceAutonomousScheduling } from "./emp002-autonomous-scheduling";
import type { WaitlistRequest } from "./emp002-scheduling";

function goal() {
  return createWaitlistGoal({ id: "goal-1", tenantId: "herreb-client-0", contactId: "patient-1", objective: "Avisame si se libera algo el martes después de las 16", resourceId: "doctor-1", dateFrom: "2026-09-22T00:00:00-03:00", dateTo: "2026-09-22T23:59:59-03:00", timeWindows: [{ from: "16:00", to: "23:59" }], durationMinutes: 60, expiresAt: "2026-09-23T00:00:00-03:00", now: "2026-09-16T18:00:00-03:00", correlationId: "corr-1" });
}

function request(id: string, contactId: string, priority: number): WaitlistRequest {
  return { id, tenantId: "herreb-client-0", contactId, resourceId: "doctor-1", dateFrom: "2026-09-22T00:00:00-03:00", dateTo: "2026-09-22T23:59:59-03:00", timeWindows: [{ from: "16:00", to: "23:59" }], durationMinutes: 60, priority, status: "WAITING", expiresAt: "2026-09-23T00:00:00-03:00", createdAt: "2026-09-16T10:00:00-03:00", correlationId: `corr-${id}` };
}

const slot = { resourceId: "doctor-1", startsAt: "2026-09-22T17:00:00-03:00", endsAt: "2026-09-22T18:00:00-03:00" };

describe("EMP-002 autonomous scheduling", () => {
  it("turns a released slot into the next autonomous offer command", () => {
    const requests = [request("wait-1", "patient-1", 10)];
    const result = reduceAutonomousScheduling({ tenantId: "herreb-client-0", correlationId: "corr-1", goal: goal() }, { type: "SLOT_RELEASED", slot, requests, now: "2026-09-20T12:00:00-03:00" });
    expect(result.state.goal.nextBestAction).toBe("OFFER_COMPATIBLE_SLOT");
    expect(result.commands[0]).toMatchObject({ type: "SEND_SLOT_OFFER", contactId: "patient-1", requestId: "wait-1" });
  });

  it("continues autonomously with the next candidate after decline", () => {
    const requests = [request("first", "patient-1", 10), request("second", "patient-2", 5)];
    const released = reduceAutonomousScheduling({ tenantId: "herreb-client-0", correlationId: "corr-1", goal: goal() }, { type: "SLOT_RELEASED", slot, requests, now: "2026-09-20T12:00:00-03:00" });
    const sent = reduceAutonomousScheduling(released.state, { type: "OFFER_SENT", now: "2026-09-20T12:01:00-03:00" });
    const declined = reduceAutonomousScheduling(sent.state, { type: "CONTACT_DECLINED", requests, now: "2026-09-20T12:05:00-03:00" });
    expect(declined.commands[0]).toMatchObject({ type: "SEND_SLOT_OFFER", contactId: "patient-2", requestId: "second" });
    expect(declined.state.goal.status).toBe("WAITING_FOR_TRIGGER");
  });

  it("produces a confirmation command after acceptance and completes the goal", () => {
    const requests = [request("winner", "patient-1", 10)];
    const released = reduceAutonomousScheduling({ tenantId: "herreb-client-0", correlationId: "corr-1", goal: goal() }, { type: "SLOT_RELEASED", slot, requests, now: "2026-09-20T12:00:00-03:00" });
    const sent = reduceAutonomousScheduling(released.state, { type: "OFFER_SENT", now: "2026-09-20T12:01:00-03:00" });
    const accepted = reduceAutonomousScheduling(sent.state, { type: "CONTACT_ACCEPTED", requests, now: "2026-09-20T12:05:00-03:00" });
    expect(accepted.state.goal.status).toBe("COMPLETED");
    expect(accepted.commands[0]).toEqual({ type: "CONFIRM_SLOT", requestId: "winner", slot });
  });

  it("fails closed on tenant mismatch", () => {
    expect(() => reduceAutonomousScheduling({ tenantId: "other-tenant", correlationId: "corr-1", goal: goal() }, { type: "SLOT_RELEASED", slot, requests: [], now: "2026-09-20T12:00:00-03:00" })).toThrow("EMP002_SCHEDULING_TENANT_MISMATCH");
  });
});
