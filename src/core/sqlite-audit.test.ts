import assert from "node:assert/strict";
import test from "node:test";
import type { AuditEvent } from "./contracts";
import { SqliteAuditSink, type AuditSqlStorage } from "./sqlite-audit";

class MemoryAuditSql implements AuditSqlStorage {
  readonly rows = new Map<string, AuditEvent>();

  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): Iterable<T> {
    const normalized = query.replace(/\s+/g, " ").trim();
    if (
      normalized.startsWith("CREATE TABLE") ||
      normalized.startsWith("CREATE INDEX")
    ) {
      return [];
    }
    if (normalized.startsWith("INSERT INTO employee_audit_events")) {
      const payload = String(bindings[7]);
      const event = JSON.parse(payload) as AuditEvent;
      if (this.rows.has(event.eventId)) {
        throw new Error("duplicate audit event");
      }
      this.rows.set(event.eventId, structuredClone(event));
      return [];
    }
    if (normalized.startsWith("SELECT payload FROM employee_audit_events")) {
      const tenantId = String(bindings[0]);
      const correlationId = String(bindings[1]);
      return [...this.rows.values()]
        .filter(
          (event) =>
            event.tenantId === tenantId && event.correlationId === correlationId
        )
        .sort(
          (a, b) =>
            a.timestamp.localeCompare(b.timestamp) ||
            a.eventId.localeCompare(b.eventId)
        )
        .map((event) => ({ payload: JSON.stringify(event) }) as T);
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function event(
  eventId: string,
  tenantId: string,
  correlationId: string,
  capabilityId: string
): AuditEvent {
  return {
    eventId,
    timestamp: `2026-09-16T12:00:0${eventId.slice(-1)}.000Z`,
    tenantId,
    employeeId: "EMP-002",
    actorId: "owner",
    correlationId,
    capabilityId,
    risk: "GREEN",
    decision: "ALLOW",
    outcome: "SUCCESS",
    evidence: { executed: true, tenantId, correlationId }
  };
}

test("SQLite audit survives sink recreation and preserves EMP-002 correlation chain", async () => {
  const sql = new MemoryAuditSql();
  const first = new SqliteAuditSink(sql);
  await first.record(event("evt-1", "herreb-client-0", "corr-002", "crm.read"));
  await first.record(
    event("evt-2", "herreb-client-0", "corr-002", "calendar.read")
  );
  await first.record(
    event("evt-3", "herreb-client-0", "corr-002", "email.read")
  );

  const afterRestart = new SqliteAuditSink(sql);
  const chain = afterRestart.listByCorrelation("herreb-client-0", "corr-002");
  assert.deepEqual(
    chain.map((item) => item.capabilityId),
    ["crm.read", "calendar.read", "email.read"]
  );
  assert.ok(chain.every((item) => item.employeeId === "EMP-002"));
  assert.ok(chain.every((item) => item.correlationId === "corr-002"));
});

test("SQLite audit lookup is tenant isolated even with same correlation id", async () => {
  const sql = new MemoryAuditSql();
  const sink = new SqliteAuditSink(sql);
  await sink.record(
    event("evt-a", "herreb-client-0", "shared-corr", "crm.read")
  );
  await sink.record(event("evt-b", "client-b", "shared-corr", "crm.read"));

  const client0 = sink.listByCorrelation("herreb-client-0", "shared-corr");
  const clientB = sink.listByCorrelation("client-b", "shared-corr");
  assert.equal(client0.length, 1);
  assert.equal(client0[0]?.tenantId, "herreb-client-0");
  assert.equal(clientB.length, 1);
  assert.equal(clientB[0]?.tenantId, "client-b");
});
