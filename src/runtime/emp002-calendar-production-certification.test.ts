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

import { EMP002Operations } from "./emp002-operations";

test("native Meta fence persists confirmed receipt, blocks ambiguous retries, and isolates tenants", async () => {
  const rows = new Map<string, { status: string; provider_message_id: string | null }>();
  const sql = { exec(query: string, ...args: unknown[]) {
    const key = (tenant: unknown, id: unknown) => String(tenant) + ":" + String(id);
    if (query.startsWith("SELECT status, provider_message_id FROM emp002_native_outbound")) {
      const row = rows.get(key(args[0], args[1]));
      return row ? [row] : [];
    }
    if (query.startsWith("INSERT INTO emp002_native_outbound")) {
      const id = key(args[0], args[1]);
      if (rows.has(id)) throw new Error("UNIQUE constraint");
      rows.set(id, { status: "UNKNOWN", provider_message_id: null });
      return [];
    }
    if (query.startsWith("UPDATE emp002_native_outbound")) {
      rows.set(key(args[2], args[3]), { status: String(args[0]), provider_message_id: String(args[1]) });
      return [];
    }
    throw new Error("Unexpected SQL: " + query);
  } };
  type Sender = (tenantId: string, messageId: string, send: () => Promise<{ messageId: string | null }>) => Promise<{ messageId: string }>;
  const sender = (EMP002Operations.prototype as unknown as { sendNativeReplyOnce: Sender }).sendNativeReplyOnce;
  const object = { state: { storage: { sql } } };
  let sends = 0;
  const accepted = () => { sends++; return Promise.resolve({ messageId: "wamid.confirmed" }); };
  const first = await sender.call(object, "tenant-A", "message-1", accepted);
  const duplicate = await sender.call(object, "tenant-A", "message-1", accepted);
  assert.equal(first.messageId, "wamid.confirmed");
  assert.equal(duplicate.messageId, "wamid.confirmed");
  assert.equal(sends, 1);
  const lost = async () => { sends++; throw new Error("network response lost"); return { messageId: null }; };
  await assert.rejects(sender.call(object, "tenant-A", "message-2", lost), /EMP002_NATIVE_META_RECONCILIATION_REQUIRED/);
  await assert.rejects(sender.call(object, "tenant-A", "message-2", accepted), /EMP002_NATIVE_META_RECONCILIATION_REQUIRED/);
  assert.equal(sends, 2);
  const other = await sender.call(object, "tenant-B", "message-2", accepted);
  assert.equal(other.messageId, "wamid.confirmed");
  assert.equal(sends, 3);
  const pending = sender.call(object, "tenant-A", "message-3", async () => {
    sends++;
    await new Promise(resolve => setTimeout(resolve, 1));
    return { messageId: "wamid.concurrent" };
  });
  await assert.rejects(sender.call(object, "tenant-A", "message-3", accepted), /EMP002_NATIVE_META_RECONCILIATION_REQUIRED/);
  await pending;
  assert.equal(sends, 4);
  // A fresh object instance reads the same durable SQL state.
  const restarted = { state: { storage: { sql } } };
  const recovered = await sender.call(restarted, "tenant-A", "message-3", accepted);
  assert.equal(recovered.messageId, "wamid.concurrent");
  assert.equal(sends, 4);
});
