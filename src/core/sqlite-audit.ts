import type { AuditSink } from "./audit";
import type { AuditEvent } from "./contracts";

export interface AuditSqlStorage {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): Iterable<T>;
}

interface AuditRow {
  payload: string;
}

export class SqliteAuditSink implements AuditSink {
  constructor(private readonly sql: AuditSqlStorage) {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS employee_audit_events (
        event_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        outcome TEXT,
        payload TEXT NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_employee_audit_tenant_correlation
      ON employee_audit_events (tenant_id, correlation_id, timestamp)
    `);
  }

  async record(event: AuditEvent): Promise<void> {
    this.sql.exec(
      `INSERT INTO employee_audit_events
       (event_id, timestamp, tenant_id, employee_id, correlation_id, capability_id, outcome, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      event.eventId,
      event.timestamp,
      event.tenantId,
      event.employeeId,
      event.correlationId,
      event.capabilityId,
      event.outcome ?? null,
      JSON.stringify(event)
    );
  }

  listByCorrelation(tenantId: string, correlationId: string): AuditEvent[] {
    if (!tenantId.trim() || !correlationId.trim()) return [];
    const rows = Array.from(
      this.sql.exec<AuditRow>(
        `SELECT payload FROM employee_audit_events
         WHERE tenant_id = ? AND correlation_id = ?
         ORDER BY timestamp ASC, event_id ASC`,
        tenantId,
        correlationId
      )
    );
    return rows.map((row) => JSON.parse(row.payload) as AuditEvent);
  }
}
