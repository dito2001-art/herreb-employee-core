import type { SchedulingSqlStorage } from "./emp002-scheduling-store";
import type {
  WhatsAppSchedulingDispatchRecord,
  WhatsAppSchedulingDispatchStore
} from "./emp002-whatsapp-dispatch-store";
import { normalizeDispatchWhatsapp } from "./emp002-whatsapp-dispatch-store";

interface DispatchRow extends Record<string, unknown> {
  payload: string;
}

export class SqliteWhatsAppSchedulingDispatchStore implements WhatsAppSchedulingDispatchStore {
  constructor(private readonly sql: SchedulingSqlStorage) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_whatsapp_dispatch (
      tenant_id TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (tenant_id, whatsapp)
    )`);
  }

  async findActiveByWhatsapp(
    tenantId: string,
    whatsapp: string
  ): Promise<WhatsAppSchedulingDispatchRecord | undefined> {
    const normalized = normalizeDispatchWhatsapp(whatsapp);
    const rows = Array.from(
      this.sql.exec<DispatchRow>(
        `SELECT payload FROM emp002_whatsapp_dispatch WHERE tenant_id = ? AND whatsapp = ?`,
        tenantId,
        normalized
      )
    );
    if (!rows.length) return undefined;
    const record = JSON.parse(rows[0].payload) as WhatsAppSchedulingDispatchRecord;
    if (record.tenantId !== tenantId || normalizeDispatchWhatsapp(record.whatsapp) !== normalized)
      throw new Error("EMP002_WHATSAPP_DISPATCH_TENANT_MISMATCH");
    return record.state.recovery?.status === "OFFER_PENDING" ? record : undefined;
  }

  async save(record: WhatsAppSchedulingDispatchRecord): Promise<void> {
    const normalized = normalizeDispatchWhatsapp(record.whatsapp);
    const updatedAt = record.state.goal.updatedAt || new Date().toISOString();
    this.sql.exec(
      `INSERT INTO emp002_whatsapp_dispatch (tenant_id, whatsapp, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(tenant_id, whatsapp) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`,
      record.tenantId,
      normalized,
      updatedAt,
      JSON.stringify({ ...record, whatsapp: normalized })
    );
  }
}
