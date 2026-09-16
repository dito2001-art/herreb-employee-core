import { describe, expect, it } from "vitest";
import { resolveCurrentOffer, startSlotRecovery } from "./emp002-slot-recovery";
import type { AvailableSlot, WaitlistRequest } from "./emp002-scheduling";

const slot: AvailableSlot = {
  resourceId: "doctor-1",
  serviceId: "consultation",
  startsAt: "2026-09-22T17:00:00-03:00",
  endsAt: "2026-09-22T18:00:00-03:00"
};

function request(id: string, contactId: string, priority: number, tenantId = "herreb-client-0"): WaitlistRequest {
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

describe("EMP-002 slot recovery", () => {
  it("offers a released slot to the highest-ranked eligible waitlist request", () => {
    const requests = [request("low", "contact-low", 5), request("high", "contact-high", 10)];
    const result = startSlotRecovery({ tenantId: "herreb-client-0", correlationId: "corr-recovery", slot, requests, now: "2026-09-20T12:00:00-03:00" });
    expect(result.recovery.status).toBe("OFFER_PENDING");
    expect(result.nextOffer?.requestId).toBe("high");
    expect(result.nextOffer?.contactId).toBe("contact-high");
  });

  it("never matches a request from another tenant", () => {
    const result = startSlotRecovery({ tenantId: "herreb-client-0", correlationId: "corr-recovery", slot, requests: [request("foreign", "contact-x", 99, "other-tenant")], now: "2026-09-20T12:00:00-03:00" });
    expect(result.recovery.status).toBe("EXHAUSTED");
    expect(result.nextOffer).toBeUndefined();
  });

  it("moves to the next candidate after a decline", () => {
    const requests = [request("first", "contact-1", 10), request("second", "contact-2", 5)];
    const started = startSlotRecovery({ tenantId: "herreb-client-0", correlationId: "corr-recovery", slot, requests, now: "2026-09-20T12:00:00-03:00" });
    const resolved = resolveCurrentOffer({ recovery: started.recovery, requests, now: "2026-09-20T12:05:00-03:00", response: "DECLINE" });
    expect(resolved.recovery.offers[0].status).toBe("DECLINED");
    expect(resolved.nextOffer?.requestId).toBe("second");
  });

  it("moves to the next candidate after offer timeout", () => {
    const requests = [request("first", "contact-1", 10), request("second", "contact-2", 5)];
    const started = startSlotRecovery({ tenantId: "herreb-client-0", correlationId: "corr-recovery", slot, requests, now: "2026-09-20T12:00:00-03:00", offerTtlMinutes: 15 });
    const resolved = resolveCurrentOffer({ recovery: started.recovery, requests, now: "2026-09-20T12:16:00-03:00", response: "TIMEOUT" });
    expect(resolved.recovery.offers[0].status).toBe("EXPIRED");
    expect(resolved.nextOffer?.requestId).toBe("second");
  });

  it("fills the slot when the active offer is accepted before expiry", () => {
    const requests = [request("winner", "contact-1", 10)];
    const started = startSlotRecovery({ tenantId: "herreb-client-0", correlationId: "corr-recovery", slot, requests, now: "2026-09-20T12:00:00-03:00" });
    const resolved = resolveCurrentOffer({ recovery: started.recovery, requests, now: "2026-09-20T12:10:00-03:00", response: "ACCEPT" });
    expect(resolved.recovery.status).toBe("FILLED");
    expect(resolved.recovery.filledByRequestId).toBe("winner");
    expect(resolved.recovery.offers[0].status).toBe("ACCEPTED");
  });
});
