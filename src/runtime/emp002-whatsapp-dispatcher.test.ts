import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryWhatsAppSchedulingDispatchStore } from "./emp002-whatsapp-dispatch-store";
import type { WhatsAppSchedulingDispatchRecord } from "./emp002-whatsapp-dispatch-store";
import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";
import type { SlotRecoveryStatus } from "./emp002-slot-recovery";

function schedulingState(status: "OFFER_PENDING" | "COMPLETED"): AutonomousSchedulingState {
  const recoveryStatus: SlotRecoveryStatus = status === "OFFER_PENDING" ? "OFFER_PENDING" : "EXHAUSTED";
  return {
    tenantId: "tenant-a",
    correlationId: "corr-1",
    goal: {
      id: "goal-1",
      tenantId: "tenant-a",
      contactId: "c1",
      kind: "WAITLIST_SLOT",
      status: status === "OFFER_PENDING" ? "WAITING_FOR_CONTACT" : "COMPLETED",
      objective: "fill slot",
      confirmedFacts: {},
      nextBestAction: status === "OFFER_PENDING" ? "WAIT_FOR_CONTACT_RESPONSE" : "NONE",
      createdAt: "2026-10-01T12:00:00-03:00",
      updatedAt: "2026-10-01T12:05:00-03:00",
      correlationId: "corr-1"
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
      status: recoveryStatus,
      candidateRequestIds: [],
      offers: []
    }
  };
}

function record(status: "OFFER_PENDING" | "COMPLETED"): WhatsAppSchedulingDispatchRecord {
  return {
    tenantId: "tenant-a",
    contactId: "c1",
    whatsapp: "+595981000000",
    timezone: "America/Asuncion",
    requests: [],
    state: schedulingState(status)
  };
}

describe("EMP-002 WhatsApp scheduling dispatch store", () => {
  it("isolates active conversations by tenant and number", async () => {
    const store = new InMemoryWhatsAppSchedulingDispatchStore();
    await store.save(record("OFFER_PENDING"));
    assert.ok(await store.findActiveByWhatsapp("tenant-a", "595981000000"));
    assert.equal(await store.findActiveByWhatsapp("tenant-b", "595981000000"), undefined);
  });

  it("does not expose completed/non-pending conversations", async () => {
    const store = new InMemoryWhatsAppSchedulingDispatchStore();
    await store.save(record("COMPLETED"));
    assert.equal(await store.findActiveByWhatsapp("tenant-a", "+595981000000"), undefined);
  });
});
