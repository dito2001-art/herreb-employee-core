import assert from "node:assert/strict";
import test from "node:test";
import { runEMP002CalendarProductionCertification } from "./emp002-calendar-production-certification";
import type { ServiceFetcher } from "../adapters/sales-ops";

test("EMP-002 certification fails closed when CRM create succeeds without ID", async () => {
  const operations: string[] = [];
  const service: ServiceFetcher = {
    async fetch(_input, init) {
      operations.push(init?.method ?? "GET");
      return Response.json({ ok: true, data: { title: "[TEMP] EMP-002 CRM agenda certification" } });
    }
  };
  const result = await runEMP002CalendarProductionCertification(
    { CRM_CAPABILITY: service, RUNTIME_GATEWAY_TOKEN: "test-token", CRM_TENANT_ID: "herreb-client-0" },
    { tenantId: "herreb-client-0", correlationId: "cert-correlation-1", idempotencyKey: "cert-idempotency-1", startsAt: "2026-10-26T15:00:00-03:00", endsAt: "2026-10-26T16:00:00-03:00" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "create-id");
  assert.equal(result.manualReconciliationRequired, true);
  assert.equal(result.cleanupOk, false);
  assert.equal(result.correlationId, "cert-correlation-1");
  assert.equal(result.idempotencyKey, "cert-idempotency-1");
  assert.deepEqual(operations, ["POST"]);
});
