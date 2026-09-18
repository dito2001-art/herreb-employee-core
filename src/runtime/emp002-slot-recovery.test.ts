import assert from "node:assert/strict";
import test from "node:test";
import { resolveCurrentOffer, startSlotRecovery } from "./emp002-slot-recovery";
import type { AvailableSlot, WaitlistRequest } from "./emp002-scheduling";

const slot: AvailableSlot = {
  tenantId: "herreb-client-0",
  resourceId: "doctor-1",
  serviceId: "consultation",
  startsAt: "2026-09-22T17:00:00-03:00",
  endsAt: "2026-09-22T18:00:00-03:00"
};

function request(
  id: string,
  contactId: string,
  priority: number,
  tenantId = "herreb-client-0"
): WaitlistRequest {
  return {
    id,
    tenantId,
    contactId,
    resourceId: "doctor-1",
    serviceId: "consultation",
    dateFrom: "2026-09-22T00:00:00-03:00",
    dateTo: "2026-09-22T23:59:59-03:00",
    timeWindows: [{ from: "16:00", to: "20:00" }],
    durationMinutes: 60,
    priority,
    status: "WAITING",
    expiresAt: "2026-09-23T00:00:00-03:00",
    createdAt: `2026-09-${priority === 10 ? "15" : "16"}T10:00:00-03:00`,
    correlationId: `corr-${id}`
  };
}

test("EMP-002 offers a released slot to the highest-ranked eligible request", () => {
  const requests = [
    request("low", "contact-low", 5),
    request("high", "contact-high", 10)
  ];
  const result = startSlotRecovery({
    tenantId: "herreb-client-0",
    correlationId: "corr-recovery",
    slot,
    requests,
    now: "2026-09-20T12:00:00-03:00"
  });
  assert.equal(result.recovery.status, "OFFER_PENDING");
  assert.equal(result.nextOffer?.requestId, "high");
  assert.equal(result.nextOffer?.contactId, "contact-high");
});

test("EMP-002 never matches a request from another tenant", () => {
  const result = startSlotRecovery({
    tenantId: "herreb-client-0",
    correlationId: "corr-recovery",
    slot,
    requests: [request("foreign", "contact-x", 99, "other-tenant")],
    now: "2026-09-20T12:00:00-03:00"
  });
  assert.equal(result.recovery.status, "EXHAUSTED");
  assert.equal(result.nextOffer, undefined);
});

test("EMP-002 moves to the next candidate after a decline", () => {
  const requests = [
    request("first", "contact-1", 10),
    request("second", "contact-2", 5)
  ];
  const started = startSlotRecovery({
    tenantId: "herreb-client-0",
    correlationId: "corr-recovery",
    slot,
    requests,
    now: "2026-09-20T12:00:00-03:00"
  });
  const resolved = resolveCurrentOffer({
    recovery: started.recovery,
    requests,
    now: "2026-09-20T12:05:00-03:00",
    response: "DECLINE"
  });
  assert.equal(resolved.recovery.offers[0].status, "DECLINED");
  assert.equal(resolved.nextOffer?.requestId, "second");
});

test("EMP-002 moves to the next candidate after offer timeout", () => {
  const requests = [
    request("first", "contact-1", 10),
    request("second", "contact-2", 5)
  ];
  const started = startSlotRecovery({
    tenantId: "herreb-client-0",
    correlationId: "corr-recovery",
    slot,
    requests,
    now: "2026-09-20T12:00:00-03:00",
    offerTtlMinutes: 15
  });
  const resolved = resolveCurrentOffer({
    recovery: started.recovery,
    requests,
    now: "2026-09-20T12:16:00-03:00",
    response: "TIMEOUT"
  });
  assert.equal(resolved.recovery.offers[0].status, "EXPIRED");
  assert.equal(resolved.nextOffer?.requestId, "second");
});

test("EMP-002 fills the slot when the active offer is accepted before expiry", () => {
  const requests = [request("winner", "contact-1", 10)];
  const started = startSlotRecovery({
    tenantId: "herreb-client-0",
    correlationId: "corr-recovery",
    slot,
    requests,
    now: "2026-09-20T12:00:00-03:00"
  });
  const resolved = resolveCurrentOffer({
    recovery: started.recovery,
    requests,
    now: "2026-09-20T12:10:00-03:00",
    response: "ACCEPT"
  });
  assert.equal(resolved.recovery.status, "FILLED");
  assert.equal(resolved.recovery.filledByRequestId, "winner");
  assert.equal(resolved.recovery.offers[0].status, "ACCEPTED");
});
