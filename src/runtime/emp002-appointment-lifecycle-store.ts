import type { SchedulingSqlStorage } from './emp002-scheduling-store';
import type { AppointmentLifecycleRecord } from './emp002-appointment-lifecycle';

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
  }

  load(tenantId: string, appointmentId: string): (AppointmentLifecycleRecord & { version: number }) | undefined {
    const rows = Array.from(this.sql.exec(
      `SELECT version, payload FROM emp002_appointment_lifecycle WHERE tenant_id = ? AND appointment_id = ?`,
      tenantId,
      appointmentId,
    ));
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
    this.sql.exec(
      `INSERT INTO emp002_appointment_lifecycle (tenant_id, appointment_id, version, updated_at, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, appointment_id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at, payload = excluded.payload`,
      record.tenantId,
      record.appointmentId,
      version,
      record.updatedAt,
      JSON.stringify(record),
    );
    return { ...record, version };
  }

  claimActionOnce(tenantId: string, actionKey: string, executedAt = new Date().toISOString()): boolean {
    const existing = Array.from(this.sql.exec(
      `SELECT action_key FROM emp002_appointment_action_seen WHERE tenant_id = ? AND action_key = ?`,
      tenantId,
      actionKey,
    ));
    if (existing.length) return false;
    this.sql.exec(
      `INSERT INTO emp002_appointment_action_seen (tenant_id, action_key, executed_at) VALUES (?, ?, ?)`,
      tenantId,
      actionKey,
      executedAt,
    );
    return true;
  }
}
