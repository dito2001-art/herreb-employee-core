import assert from "node:assert/strict";
import test from "node:test";
import {
  createCalendarControlledWriteTransport,
  createEmailControlledSendTransport
} from "./controlled-write-http";

function service(requests: Request[]) {
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      requests.push(new Request(input, init));
      return Response.json({ ok: true, id: "upstream-1" });
    }
  };
}

test("controlled calendar write propagates tenant correlation and idempotency", async () => {
  const requests: Request[] = [];
  const transport = createCalendarControlledWriteTransport({
    service: service(requests),
    token: "secret",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    correlationId: "corr-1",
    idempotencyKey: "confirm-slot-1",
    request: {
      operation: "update",
      eventId: "event-1",
      changes: { startTime: "2026-09-22T17:00:00-03:00" }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers.get("X-Tenant-ID"), "herreb-client-0");
  assert.equal(requests[0].headers.get("X-Correlation-ID"), "corr-1");
  assert.equal(requests[0].headers.get("Idempotency-Key"), "confirm-slot-1");
  assert.equal(JSON.stringify(result.evidence).includes("secret"), false);
});

test("controlled write fails closed before upstream on tenant mismatch", async () => {
  const requests: Request[] = [];
  const transport = createCalendarControlledWriteTransport({
    service: service(requests),
    token: "secret",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "other-tenant",
    correlationId: "corr-1",
    idempotencyKey: "key-1",
    request: { operation: "delete", eventId: "event-1" }
  });
  assert.equal(result.error?.code, "CONTROLLED_WRITE_TENANT_SCOPE_MISMATCH");
  assert.equal(requests.length, 0);
});

test("controlled write requires idempotency before upstream", async () => {
  const requests: Request[] = [];
  const transport = createEmailControlledSendTransport({
    service: service(requests),
    token: "secret",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    correlationId: "corr-1",
    request: { operation: "send", to: ["client@example.com"], subject: "Turno", body: "Confirmado" }
  });
  assert.equal(result.error?.code, "CONTROLLED_WRITE_IDEMPOTENCY_REQUIRED");
  assert.equal(requests.length, 0);
});
