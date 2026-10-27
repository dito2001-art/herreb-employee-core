import type { SchedulingSqlStorage } from "./emp002-scheduling-store";

export type WorkforceCalendarKind = "TASK" | "MEETING" | "EVENT";
export interface WorkforceCalendarEntry {
  tenantId: string;
  id: string;
  kind: WorkforceCalendarKind;
  title: string;
  startsAt: string;
  endsAt?: string;
  reminderAt?: string;
  status: "ACTIVE" | "CANCELLED";
  updatedAt: string;
  version: number;
}

/** Tenant-scoped native storage; no external CRM or Google Calendar calls. */
export class WorkforceCalendarStore {
  constructor(private readonly sql: SchedulingSqlStorage) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS workforce_calendar_entries (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL,
      starts_at TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    )`);
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS workforce_calendar_by_date ON workforce_calendar_entries (tenant_id, starts_at)"
    );
  }

  get(tenantId: string, id: string): WorkforceCalendarEntry | undefined {
    if (!tenantId.trim() || !id.trim())
      throw new Error("INVALID_CALENDAR_SCOPE");
    const row = Array.from(
      this.sql.exec(
        "SELECT payload FROM workforce_calendar_entries WHERE tenant_id = ? AND id = ?",
        tenantId,
        id
      )
    )[0];
    if (!row) return undefined;
    const entry = JSON.parse(String(row.payload)) as WorkforceCalendarEntry;
    if (entry.tenantId !== tenantId || entry.id !== id)
      throw new Error("CALENDAR_TENANT_MISMATCH");
    return entry;
  }

  list(tenantId: string, from: string, to: string): WorkforceCalendarEntry[] {
    if (
      !tenantId.trim() ||
      !Number.isFinite(Date.parse(from)) ||
      !Number.isFinite(Date.parse(to)) ||
      Date.parse(from) >= Date.parse(to)
    )
      throw new Error("INVALID_CALENDAR_QUERY");
    return Array.from(
      this.sql.exec(
        "SELECT payload FROM workforce_calendar_entries WHERE tenant_id = ? AND starts_at >= ? AND starts_at < ? ORDER BY starts_at",
        tenantId,
        new Date(from).toISOString(),
        new Date(to).toISOString()
      )
    )
      .map((row) => JSON.parse(String(row.payload)) as WorkforceCalendarEntry)
      .filter(
        (entry) => entry.tenantId === tenantId && entry.status === "ACTIVE"
      );
  }

  reminders(tenantId: string, now: string): WorkforceCalendarEntry[] {
    if (!tenantId.trim() || !Number.isFinite(Date.parse(now)))
      throw new Error("INVALID_CALENDAR_QUERY");
    return Array.from(
      this.sql.exec(
        "SELECT payload FROM workforce_calendar_entries WHERE tenant_id = ? ORDER BY starts_at",
        tenantId
      )
    )
      .map((row) => JSON.parse(String(row.payload)) as WorkforceCalendarEntry)
      .filter(
        (entry) =>
          entry.tenantId === tenantId &&
          entry.status === "ACTIVE" &&
          typeof entry.reminderAt === "string" &&
          Number.isFinite(Date.parse(entry.reminderAt)) &&
          Date.parse(entry.reminderAt) <= Date.parse(now)
      )
      .sort((a, b) => Date.parse(a.reminderAt!) - Date.parse(b.reminderAt!));
  }

  save(
    input: Omit<WorkforceCalendarEntry, "version">,
    expectedVersion = 0
  ): WorkforceCalendarEntry {
    if (
      input.reminderAt !== undefined &&
      (typeof input.reminderAt !== "string" ||
        !Number.isFinite(Date.parse(input.reminderAt)))
    )
      throw new Error("INVALID_CALENDAR_REMINDER");
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.tenantId !== "string" ||
      typeof input.id !== "string" ||
      typeof input.title !== "string" ||
      typeof input.startsAt !== "string" ||
      typeof input.updatedAt !== "string" ||
      (input.endsAt !== undefined && typeof input.endsAt !== "string") ||
      !input.tenantId.trim() ||
      !input.id.trim() ||
      !input.title.trim() ||
      !["TASK", "MEETING", "EVENT"].includes(input.kind) ||
      !["ACTIVE", "CANCELLED"].includes(input.status) ||
      !Number.isFinite(Date.parse(input.startsAt)) ||
      !Number.isFinite(Date.parse(input.updatedAt)) ||
      (input.endsAt &&
        (!Number.isFinite(Date.parse(input.endsAt)) ||
          Date.parse(input.endsAt) <= Date.parse(input.startsAt)))
    )
      throw new Error("INVALID_CALENDAR_ENTRY");
    if (input.kind !== "TASK" && !input.endsAt)
      throw new Error("CALENDAR_END_REQUIRED");
    const current = this.get(input.tenantId, input.id);
    if ((current?.version ?? 0) !== expectedVersion)
      throw new Error("CALENDAR_VERSION_CONFLICT");
    if (input.status === "ACTIVE" && input.kind !== "TASK" && input.endsAt) {
      // Include earlier-starting meetings that can still overlap this slot.
      // A finite lookback would miss long-running events.
      const overlaps = Array.from(
        this.sql.exec(
          "SELECT payload FROM workforce_calendar_entries WHERE tenant_id = ? AND starts_at < ? ORDER BY starts_at",
          input.tenantId,
          new Date(input.endsAt).toISOString()
        )
      )
        .map((row) => JSON.parse(String(row.payload)) as WorkforceCalendarEntry)
        .filter(
          (entry) =>
            entry.tenantId === input.tenantId &&
            entry.status === "ACTIVE" &&
            entry.id !== input.id &&
            entry.kind !== "TASK" &&
            entry.endsAt
        );
      if (
        overlaps.some(
          (entry) =>
            Date.parse(entry.startsAt) < Date.parse(input.endsAt!) &&
            Date.parse(entry.endsAt!) > Date.parse(input.startsAt)
        )
      )
        throw new Error("CALENDAR_TIME_CONFLICT");
    }

    const next: WorkforceCalendarEntry = {
      ...input,
      version: expectedVersion + 1
    };
    this.sql.exec(
      "INSERT INTO workforce_calendar_entries (tenant_id, id, version, starts_at, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, id) DO UPDATE SET version = excluded.version, starts_at = excluded.starts_at, payload = excluded.payload",
      input.tenantId,
      input.id,
      next.version,
      new Date(input.startsAt).toISOString(),
      JSON.stringify(next)
    );
    const readback = this.get(input.tenantId, input.id);
    if (JSON.stringify(readback) !== JSON.stringify(next))
      throw new Error("CALENDAR_READBACK_MISMATCH");
    return readback!;
  }
}
