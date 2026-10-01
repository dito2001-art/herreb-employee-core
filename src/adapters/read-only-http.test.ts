import assert from "node:assert/strict";
import test from "node:test";
import {
  createCalendarReadOnlyTransport,
  createEmailReadOnlyTransport
} from "./read-only-http";
import type { ServiceFetcher } from "./sales-ops";

function failingService(): ServiceFetcher {
  return {
    async fetch() {
      return Response.json(
        {
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          privateData: "must-not-enter-audit"
        },
        { status: 503 }
      );
    }
  };
}

test("Calendar upstream failures preserve operation/status but not response payload or token evidence", async () => {
  const transport = createCalendarReadOnlyTransport({
    service: failingService(),
    token: "calendar-secret",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    correlationId: "corr-calendar-redaction",
    request: {
      operation: "search",
      timeMin: "2026-09-16T00:00:00-03:00",
      timeMax: "2026-09-17T00:00:00-03:00"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.evidence?.operation, "search");
  assert.equal(result.evidence?.upstreamStatus, 503);
  const evidence = JSON.stringify(result.evidence);
  assert.equal(evidence.includes("calendar-secret"), false);
  assert.equal(evidence.includes("google-access-token"), false);
  assert.equal(evidence.includes("google-refresh-token"), false);
  assert.equal(evidence.includes("must-not-enter-audit"), false);
});

test("Email upstream failures preserve operation/status but not response payload or token evidence", async () => {
  const transport = createEmailReadOnlyTransport({
    service: failingService(),
    token: "email-secret",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    correlationId: "corr-email-redaction",
    request: {
      operation: "search",
      query: "HerreB",
      maxResults: 1
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.evidence?.operation, "search");
  assert.equal(result.evidence?.upstreamStatus, 503);
  const evidence = JSON.stringify(result.evidence);
  assert.equal(evidence.includes("email-secret"), false);
  assert.equal(evidence.includes("google-access-token"), false);
  assert.equal(evidence.includes("google-refresh-token"), false);
  assert.equal(evidence.includes("must-not-enter-audit"), false);
});
