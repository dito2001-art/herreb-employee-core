import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WhatsAppTransport } from "../adapters/whatsapp";
import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";
import {
  classifyExternalSchedulingReply,
  executeSchedulingCommunicationCommands
} from "./emp002-whatsapp-scheduling";

const whatsapp: WhatsAppTransport = {
  async sendText(message) {
    return {
      ok: true,
      provider: "meta-cloud-api",
      messageId: "wamid.test",
      status: 200,
      tenantId: message.tenantId,
      correlationId: message.correlationId
    };
  }
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
    objective: "Conseguir un turno",
    confirmedFacts: {},
    nextBestAction: "WAIT_FOR_CONTACT_RESPONSE",
    createdAt: "2026-10-02T12:00:00-03:00",
    updatedAt: "2026-10-02T12:00:00-03:00",
    correlationId: "corr-1"
  }
};

describe("EMP-002 WhatsApp scheduling bridge", () => {
  it("sends SEND_SLOT_OFFER to the external contact", async () => {
    const result = await executeSchedulingCommunicationCommands({
      tenantId: "tenant-a",
      correlationId: "corr-1",
      whatsapp,
      contacts: {
        "contact-1": { id: "contact-1", whatsapp: "+595981000000" }
      },
      result: {
        state,
        commands: [
          {
            type: "SEND_SLOT_OFFER",
            idempotencyKey: "offer-1",
            contactId: "contact-1",
            requestId: "request-1",
            expiresAt: "2026-10-02T15:00:00-03:00"
          }
        ]
      }
    });

    assert.deepEqual(result, [
      {
        commandType: "SEND_SLOT_OFFER",
        idempotencyKey: "offer-1",
        ok: true,
        messageId: "wamid.test"
      }
    ]);
  });

  it("classifies common customer replies", () => {
    assert.equal(classifyExternalSchedulingReply("ACEPTO"), "ACCEPT");
    assert.equal(classifyExternalSchedulingReply("sí"), "ACCEPT");
    assert.equal(classifyExternalSchedulingReply("no me sirve"), "DECLINE");
    assert.equal(classifyExternalSchedulingReply("qué horario?"), "UNKNOWN");
  });
});
