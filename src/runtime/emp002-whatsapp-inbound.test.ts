import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInboundSchedulingReply } from "./emp002-whatsapp-inbound";
import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";
import type { WaitlistRequest } from "./emp002-scheduling";

const request: WaitlistRequest = {
  id: "req-1",
  tenantId: "tenant-a",
  contactId: "contact-1",
  resourceId: "resource-1",
  dateFrom: "2026-10-02T00:00:00-03:00",
  dateTo: "2026-10-02T23:59:59-03:00",
  durationMinutes: 30,
  priority: 1,
  status: "WAITING",
  expiresAt: "2026-10-02T18:00:00-03:00",
  createdAt: "2026-10-01T12:00:00-03:00",
  correlationId: "corr-1"
};

const state: AutonomousSchedulingState = {
  tenantId: "tenant-a",
  correlationId: "corr-1",
  goal: {
    id: "goal-1",
    tenantId: "tenant-a",
    contactId: "contact-1",
    kind: "WAITLIST_SLOT",
    status: "WAITING_FOR_CONTACT",
    objective: "Fill released slot",
    confirmedFacts: {},
    nextBestAction: "WAIT_FOR_CONTACT_RESPONSE",
    createdAt: "2026-10-01T12:00:00-03:00",
    updatedAt: "2026-10-01T12:05:00-03:00",
    correlationId: "corr-1",
    waitlist: request
  },
  recovery: {
    id: "recovery-1",
    version: 1,
    tenantId: "tenant-a",
    correlationId: "corr-1",
    slot: {
      tenantId: "tenant-a",
      resourceId: "resource-1",
      startsAt: "2026-10-02T10:00:00-03:00",
      endsAt: "2026-10-02T10:30:00-03:00"
    },
    status: "OFFER_PENDING",
    candidateRequestIds: ["req-1"],
    filledByRequestId: undefined,
    offers: [
      {
        requestId: "req-1",
        contactId: "contact-1",
        offeredAt: "2026-10-01T12:05:00-03:00",
        expiresAt: "2026-10-01T12:20:00-03:00",
        status: "PENDING"
      }
    ]
  }
};

describe("EMP-002 inbound WhatsApp scheduling", () => {
  it("turns an accepted WhatsApp reply into CONFIRM_SLOT", () => {
    const resolution = resolveInboundSchedulingReply(
      {
        tenantId: "tenant-a",
        from: "+595981000000",
        body: "acepto",
        receivedAt: "2026-10-01T12:10:00-03:00",
        messageId: "wamid.inbound-1"
      },
      [
        {
          tenantId: "tenant-a",
          contactId: "contact-1",
          whatsapp: "+595981000000",
          state,
          requests: [request]
        }
      ]
    );
    assert.equal(resolution.handled, true);
    if (!resolution.handled) return;
    assert.equal(resolution.response, "ACCEPT");
    assert.equal(resolution.result.commands[0]?.type, "CONFIRM_SLOT");
  });

  it("does not cross tenant boundaries", () => {
    const resolution = resolveInboundSchedulingReply(
      {
        tenantId: "tenant-b",
        from: "+595981000000",
        body: "acepto",
        receivedAt: "2026-10-01T12:10:00-03:00",
        messageId: "wamid.inbound-2"
      },
      [
        {
          tenantId: "tenant-a",
          contactId: "contact-1",
          whatsapp: "+595981000000",
          state,
          requests: [request]
        }
      ]
    );
    assert.deepEqual(resolution, { handled: false, reason: "NO_ACTIVE_OFFER" });
  });
});
