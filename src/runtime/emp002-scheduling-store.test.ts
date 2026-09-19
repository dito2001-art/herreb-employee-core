import assert from "node:assert/strict";
import test from "node:test";
import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";
import { createWaitlistGoal } from "./emp002-cognitive-scheduling";
import {
  SqliteSchedulingStateStore,
  type SchedulingSqlStorage
} from "./emp002-scheduling-store";

interface Row {
  tenantId: string;
  goalId: string;
  version: number;
  updatedAt: string;
  payload: string;
}

class MemorySchedulingSql implements SchedulingSqlStorage {
  readonly rows = new Map<string, Row>();

  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): Iterable<T> {
    const normalized = query.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("CREATE TABLE")) return [];
    if (normalized.startsWith("SELECT payload FROM emp002_scheduling_state")) {
      const key = `${String(bindings[0])}:${String(bindings[1])}`;
      const row = this.rows.get(key);
      return row ? ([{ payload: row.payload }] as T[]) : [];
    }
    if (normalized.startsWith("INSERT INTO emp002_scheduling_state")) {
      const row: Row = {
        tenantId: String(bindings[0]),
        goalId: String(bindings[1]),
        version: Number(bindings[2]),
        updatedAt: String(bindings[3]),
        payload: String(bindings[4])
      };
      this.rows.set(`${row.tenantId}:${row.goalId}`, row);
      return [];
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function state(tenantId = "herreb-client-0"): AutonomousSchedulingState {
  return {
    tenantId,
    correlationId: "corr-1",
    goal: createWaitlistGoal({
      id: "goal-1",
      tenantId,
      contactId: "contact-1",
      objective: "Avisame si se libera un turno",
      dateFrom: "2026-09-22T00:00:00-03:00",
      dateTo: "2026-09-22T23:59:59-03:00",
      durationMinutes: 60,
      expiresAt: "2026-09-23T00:00:00-03:00",
      now: "2026-09-18T12:00:00-03:00",
      correlationId: "corr-1"
    })
  };
}

test("EMP-002 scheduling state survives store recreation", () => {
  const sql = new MemorySchedulingSql();
  const first = new SqliteSchedulingStateStore(sql);
  const saved = first.save(state(), 0);
  assert.equal(saved.version, 1);
  const afterRestart = new SqliteSchedulingStateStore(sql);
  assert.deepEqual(afterRestart.load("herreb-client-0", "goal-1"), saved);
});

test("EMP-002 scheduling persistence is tenant isolated", () => {
  const sql = new MemorySchedulingSql();
  const store = new SqliteSchedulingStateStore(sql);
  store.save(state("herreb-client-0"), 0);
  store.save(state("client-b"), 0);
  assert.equal(store.load("herreb-client-0", "goal-1")?.tenantId, "herreb-client-0");
  assert.equal(store.load("client-b", "goal-1")?.tenantId, "client-b");
});

test("EMP-002 rejects stale concurrent scheduling writes", () => {
  const sql = new MemorySchedulingSql();
  const store = new SqliteSchedulingStateStore(sql);
  store.save(state(), 0);
  assert.throws(
    () => store.save(state(), 0),
    /EMP002_SCHEDULING_CONCURRENT_MODIFICATION/
  );
});

test("EMP-002 rejects state whose goal belongs to another tenant", () => {
  const sql = new MemorySchedulingSql();
  const store = new SqliteSchedulingStateStore(sql);
  const invalid = state();
  invalid.goal = { ...invalid.goal, tenantId: "other-tenant" };
  assert.throws(
    () => store.save(invalid, 0),
    /EMP002_SCHEDULING_PERSISTENCE_TENANT_MISMATCH/
  );
});
