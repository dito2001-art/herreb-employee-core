import type { SchedulingSqlStorage } from './emp002-scheduling-store';
import type { AppointmentLifecycleRecord } from './emp002-appointment-lifecycle';

export interface AppointmentLifecycleAction {
  tenantId: string;
  appointmentId: string;
  actionKey: string;
  kind: 'CONFIRMATION' | 'REMINDER' | 'WAITLIST_OFFER';
  dueAt: string;
  payload?: Record<string, unknown>;
}

const ACTION_LEASE_MS = 5 * 60 * 1000;

export class SqliteAppointmentLifecycleStore {
  constructor(private readonly sql: SchedulingSqlStorage) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_appointment_lifecycle (
      tenant_id TEXT NOT NULL,
      appointment_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (tenant_id, appointment_id)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_appointment_action_seen (
      tenant_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, action_key)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_appointment_action_lease (
      tenant_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, action_key)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_appointment_action_queue (
      tenant_id TEXT NOT NULL,
      appointment_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      due_at TEXT NOT NULL,
      payload TEXT,
      PRIMARY KEY (tenant_id, action_key)
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_emp002_appointment_action_due ON emp002_appointment_action_queue (tenant_id, due_at)`);
  }

  load(tenantId: string, appointmentId: string): (AppointmentLifecycleRecord & { version: number }) | undefined {
    const rows = Array.from(this.sql.exec(`SELECT version, payload FROM emp002_appointment_lifecycle WHERE tenant_id = ? AND appointment_id = ?`, tenantId, appointmentId));
    if (!rows.length) return undefined;
    const payload = rows[0].payload;
    if (typeof payload !== 'string' || typeof rows[0].version !== 'number') throw new Error('EMP002_APPOINTMENT_INVALID_STATE');
    const record = JSON.parse(payload) as AppointmentLifecycleRecord;
    if (record.tenantId !== tenantId || record.appointmentId !== appointmentId) throw new Error('EMP002_APPOINTMENT_TENANT_MISMATCH');
    return { ...record, version: rows[0].version };
  }

  save(record: AppointmentLifecycleRecord, expectedVersion?: number): AppointmentLifecycleRecord & { version: number } {
    const current = this.load(record.tenantId, record.appointmentId);
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) throw new Error('EMP002_APPOINTMENT_CONCURRENT_MODIFICATION');
    const version = currentVersion + 1;
    this.sql.exec(`INSERT INTO emp002_appointment_lifecycle (tenant_id, appointment_id, version, updated_at, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, appointment_id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at, payload = excluded.payload`, record.tenantId, record.appointmentId, version, record.updatedAt, JSON.stringify(record));
    return { ...record, version };
  }

  scheduleAction(action: AppointmentLifecycleAction): void {
    if (!Number.isFinite(Date.parse(action.dueAt))) throw new Error('EMP002_APPOINTMENT_ACTION_INVALID_DUE_AT');
    this.sql.exec(`INSERT INTO emp002_appointment_action_queue (tenant_id, appointment_id, action_key, kind, due_at, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, action_key) DO UPDATE SET appointment_id = excluded.appointment_id, kind = excluded.kind, due_at = excluded.due_at, payload = excluded.payload`, action.tenantId, action.appointmentId, action.actionKey, action.kind, action.dueAt, action.payload ? JSON.stringify(action.payload) : null);
  }

  dueActions(tenantId: string, now = new Date().toISOString(), limit = 50): AppointmentLifecycleAction[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = Array.from(this.sql.exec(`SELECT appointment_id, action_key, kind, due_at, payload FROM emp002_appointment_action_queue WHERE tenant_id = ? AND due_at <= ? ORDER BY due_at ASC LIMIT ?`, tenantId, now, safeLimit));
    return rows.map((row) => ({ tenantId, appointmentId: String(row.appointment_id), actionKey: String(row.action_key), kind: String(row.kind) as AppointmentLifecycleAction['kind'], dueAt: String(row.due_at), payload: typeof row.payload === 'string' && row.payload ? JSON.parse(row.payload) as Record<string, unknown> : undefined }));
  }

  claimActionOnce(tenantId: string, actionKey: string, claimedAt = new Date().toISOString()): boolean {
    const executed = Array.from(this.sql.exec(`SELECT action_key FROM emp002_appointment_action_seen WHERE tenant_id = ? AND action_key = ?`, tenantId, actionKey));
    if (executed.length) return false;
    const claimedMs = Date.parse(claimedAt);
    if (!Number.isFinite(claimedMs)) throw new Error('EMP002_APPOINTMENT_ACTION_INVALID_CLAIM_AT');
    const activeLease = Array.from(this.sql.exec(`SELECT expires_at FROM emp002_appointment_action_lease WHERE tenant_id = ? AND action_key = ?`, tenantId, actionKey));
    if (activeLease.length && typeof activeLease[0].expires_at === 'string' && Date.parse(activeLease[0].expires_at) > claimedMs) return false;
    const expiresAt = new Date(claimedMs + ACTION_LEASE_MS).toISOString();
    this.sql.exec(`INSERT INTO emp002_appointment_action_lease (tenant_id, action_key, expires_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id, action_key) DO UPDATE SET expires_at = excluded.expires_at`, tenantId, actionKey, expiresAt);
    return true;
  }

  completeActionClaim(tenantId: string, actionKey: string, executedAt = new Date().toISOString()): void {
    this.sql.exec(`INSERT INTO emp002_appointment_action_seen (tenant_id, action_key, executed_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id, action_key) DO NOTHING`, tenantId, actionKey, executedAt);
    this.releaseActionClaim(tenantId, actionKey);
  }

  releaseActionClaim(tenantId: string, actionKey: string): void {
    this.sql.exec(`DELETE FROM emp002_appointment_action_lease WHERE tenant_id = ? AND action_key = ?`, tenantId, actionKey);
  }

  claimDueActions(tenantId: string, now = new Date().toISOString(), limit = 50): AppointmentLifecycleAction[] {
    const claimed: AppointmentLifecycleAction[] = [];
    for (const action of this.dueActions(tenantId, now, limit)) if (this.claimActionOnce(tenantId, action.actionKey, now)) claimed.push(action);
    return claimed;
  }
}
