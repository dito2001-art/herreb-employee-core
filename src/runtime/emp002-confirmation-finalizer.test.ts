import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WhatsAppTransport, WhatsAppMessage } from "../adapters/whatsapp";
import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";
import { finalizeSlotConfirmation } from "./emp002-confirmation-finalizer";

const sent: WhatsAppMessage[] = [];
const whatsapp: WhatsAppTransport = {
  async sendText(message) {
    sent.push(message);
    return {
      ok: true,
      provider: "meta-cloud-api",
      messageId: `wamid.${sent.length}`,
      status: 200,
      tenantId: message.tenantId,
      correlationId: message.correlationId
    };
  }
};

function activeState(withRecovery = true): AutonomousSchedulingState {
  return {
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
    },
    recovery: withRecovery
      ? {
          id: "recovery-1",
          version: 2,
          tenantId: "tenant-a",
          correlationId: "corr-1",
          slot: {
            tenantId: "tenant-a",
            resourceId: "r1",
            startsAt: "2026-10-02T10:00:00-03:00",
            endsAt: "2026-10-02T10:30:00-03:00"
          },
          status: "FILLED",
          candidateRequestIds: ["req-1"],
          offers: [],
          filledByRequestId: "req-1"
        }
      : undefined
  };
}

describe("EMP-002 confirmation finalizer", () => {
  it("completes recovery and notifies customer and owner only after verified execution", async () => {
    sent.length = 0;
    const finalized = await finalizeSlotConfirmation({
      tenantId: "tenant-a",
      correlationId: "corr-1",
      now: "2026-10-01T12:11:00-03:00",
      state: activeState(),
      executions: [
        {
          commandType: "CONFIRM_SLOT",
          idempotencyKey: "confirm-1",
          ok: true,
          eventId: "event-1",
          upstreamStatus: 200
        }
      ],
      contact: {
        id: "contact-1",
        whatsapp: "+595981000000",
        displayName: "Ana"
      },
      ownerWhatsapp: "+595981111111",
      whatsapp
    });
    assert.equal(finalized.verified, true);
    assert.equal(finalized.state.goal.status, "COMPLETED");
    assert.deepEqual(
      finalized.notifications.map((item) => item.audience),
      ["EXTERNAL_CONTACT", "OWNER"]
    );
    assert.equal(sent.length, 2);
  });

  it("keeps a failed confirmation retryable and does not notify", async () => {
    sent.length = 0;
    const finalized = await finalizeSlotConfirmation({
      tenantId: "tenant-a",
      correlationId: "corr-1",
      now: "2026-10-01T12:11:00-03:00",
      state: activeState(),
      executions: [
        {
          commandType: "CONFIRM_SLOT",
          idempotencyKey: "confirm-1",
          ok: false,
          error: "CALENDAR_CONFIRMATION_FAILED"
        }
      ],
      contact: { id: "contact-1", whatsapp: "+595981000000" },
      whatsapp
    });
    assert.equal(finalized.verified, false);
    assert.equal(finalized.state.goal.status, "ACTIVE");
    assert.equal(finalized.state.goal.nextBestAction, "RETRY_OR_ESCALATE_CONFIRMATION");
    assert.equal(finalized.state.recovery?.status, "OFFER_PENDING");
    assert.equal(sent.length, 0);
  });
});
