import type { AutonomousSchedulingState } from "./emp002-autonomous-scheduling";

export interface SchedulingSqlStorage {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): Iterable<T>;
}

interface StateRow {
  payload: string;
}

export class SqliteSchedulingStateStore {
  constructor(private readonly sql: SchedulingSqlStorage) {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS emp002_scheduling_state (
        tenant_id TEXT NOT NULL,
        goal_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (tenant_id, goal_id)
      )
    `);
  }

  load(tenantId: string, goalId: string): AutonomousSchedulingState | undefined {
    if (!tenantId.trim() || !goalId.trim()) return undefined;
    const rows = Array.from(
      this.sql.exec<StateRow>(
        `SELECT payload FROM emp002_scheduling_state
         WHERE tenant_id = ? AND goal_id = ?`,
        tenantId,
        goalId
      )
    );
    if (!rows.length) return undefined;
    const state = JSON.parse(rows[0].payload) as AutonomousSchedulingState;
    if (state.tenantId !== tenantId || state.goal.id !== goalId)
      throw new Error("EMP002_SCHEDULING_PERSISTENCE_TENANT_MISMATCH");
    return state;
  }

  save(
    state: AutonomousSchedulingState,
    expectedVersion?: number
  ): AutonomousSchedulingState {
    if (state.goal.tenantId !== state.tenantId)
      throw new Error("EMP002_SCHEDULING_PERSISTENCE_TENANT_MISMATCH");
    const current = this.load(state.tenantId, state.goal.id);
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion)
      throw new Error("EMP002_SCHEDULING_CONCURRENT_MODIFICATION");
    const next = { ...state, version: currentVersion + 1 };
    this.sql.exec(
      `INSERT INTO emp002_scheduling_state
       (tenant_id, goal_id, version, updated_at, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, goal_id) DO UPDATE SET
         version = excluded.version,
         updated_at = excluded.updated_at,
         payload = excluded.payload`,
      next.tenantId,
      next.goal.id,
      next.version,
      next.goal.updatedAt,
      JSON.stringify(next)
    );
    return next;
  }
}
