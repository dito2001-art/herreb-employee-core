import { normalizeEMP002WhatsAppNumber } from './emp002-whatsapp-normalize';
import type { SchedulingSqlStorage } from './emp002-scheduling-store';
import type { WorkforceCalendarEntry } from './workforce-calendar-store';

export function reminderOwnerForTenant(raw: string | undefined, tenantId: string): string {
  let manifests: unknown;
  try { manifests = JSON.parse(raw ?? '[]'); } catch { throw new Error('EMP002_REMINDER_MANIFEST_INVALID'); }
  if (!Array.isArray(manifests)) throw new Error('EMP002_REMINDER_MANIFEST_INVALID');
  const matches = manifests.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && !Array.isArray(m) && (m as Record<string, unknown>).tenantId === tenantId);
  if (matches.length !== 1) throw new Error('EMP002_REMINDER_TENANT_NOT_UNIQUE');
  const m = matches[0];
  if (!Array.isArray(m.whatsappOwners) || !m.whatsappOwners.every(v => typeof v === 'string')) throw new Error('EMP002_REMINDER_OWNERS_INVALID');
  if (typeof m.reminderOwnerWhatsapp !== 'string' || !m.reminderOwnerWhatsapp.trim()) throw new Error('EMP002_REMINDER_OWNER_NOT_CONFIGURED');
  const owner = normalizeEMP002WhatsAppNumber(m.reminderOwnerWhatsapp);
  if (!/^\d{8,15}$/.test(owner)) throw new Error('EMP002_REMINDER_OWNER_INVALID');
  const owners = m.whatsappOwners.map((v: string) => normalizeEMP002WhatsAppNumber(v));
  if (!owner || !owners.includes(owner) || owners.filter((v: string) => v === owner).length !== 1) throw new Error('EMP002_REMINDER_OWNER_UNAUTHORIZED');
  return owner;
}

export class NativeReminderStore {
  constructor(private readonly sql: SchedulingSqlStorage) {
    this.sql.exec('CREATE TABLE IF NOT EXISTS emp002_native_reminder_actions (tenant_id TEXT NOT NULL, calendar_id TEXT NOT NULL, calendar_version INTEGER NOT NULL, due_at TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, provider_message_id TEXT, evidence_reference TEXT, reconciled_by TEXT, PRIMARY KEY(tenant_id,calendar_id,calendar_version))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS emp002_native_reminders_due ON emp002_native_reminder_actions(tenant_id,status,due_at)');
  }
  replace(entry: WorkforceCalendarEntry, recipient?: string): void {
    this.sql.exec("UPDATE emp002_native_reminder_actions SET status = 'INVALIDATED' WHERE tenant_id = ? AND calendar_id = ? AND status = 'PENDING'", entry.tenantId, entry.id);
    if (entry.status === 'ACTIVE' && entry.reminderAt) {
      if (!recipient) throw new Error('EMP002_REMINDER_OWNER_NOT_CONFIGURED');
      this.sql.exec('INSERT INTO emp002_native_reminder_actions (tenant_id,calendar_id,calendar_version,due_at,recipient,status) VALUES (?,?,?,?,?,?)', entry.tenantId,entry.id,entry.version,new Date(entry.reminderAt).toISOString(),recipient,'PENDING');
    }
  }
  due(tenantId: string, now: string): Array<{ calendar_id: string; calendar_version: number; due_at: string; recipient: string }> {
    return Array.from(this.sql.exec("SELECT calendar_id,calendar_version,due_at,recipient FROM emp002_native_reminder_actions WHERE tenant_id = ? AND status = 'PENDING' AND due_at <= ? ORDER BY due_at LIMIT 25",tenantId,new Date(now).toISOString())) as Array<{calendar_id:string;calendar_version:number;due_at:string;recipient:string}>;
  }
  claim(tenantId: string, id: string, version: number, current: WorkforceCalendarEntry | undefined, now: string): {recipient:string; actionKey:string} {
    const rows = Array.from(this.sql.exec('SELECT status,due_at,recipient FROM emp002_native_reminder_actions WHERE tenant_id = ? AND calendar_id = ? AND calendar_version = ?',tenantId,id,version));
    const row = rows[0];
    if (!row || row.status !== 'PENDING') throw new Error('EMP002_REMINDER_ALREADY_CLAIMED');
    if (!current || current.tenantId !== tenantId || current.id !== id || current.version !== version || current.status !== 'ACTIVE' || !current.reminderAt || new Date(current.reminderAt).toISOString() !== row.due_at || row.due_at > new Date(now).toISOString()) throw new Error('EMP002_REMINDER_STALE');
    this.sql.exec("UPDATE emp002_native_reminder_actions SET status = 'UNKNOWN' WHERE tenant_id = ? AND calendar_id = ? AND calendar_version = ? AND status = 'PENDING'",tenantId,id,version);
    return {recipient:String(row.recipient),actionKey:`emp002-reminder:${tenantId}:${id}:${version}`};
  }
  markSent(tenantId:string,id:string,version:number,providerMessageId:string):void {
    if (!/^wamid[.\\w-]{4,255}$/.test(providerMessageId)) throw new Error('EMP002_REMINDER_PROVIDER_EVIDENCE_MISSING');
    const rows=Array.from(this.sql.exec('SELECT status FROM emp002_native_reminder_actions WHERE tenant_id = ? AND calendar_id = ? AND calendar_version = ?',tenantId,id,version));
    if (rows.length!==1 || rows[0].status!=='UNKNOWN') throw new Error('EMP002_REMINDER_SEND_STATE_CONFLICT');
    this.sql.exec("UPDATE emp002_native_reminder_actions SET status='SENT',provider_message_id=? WHERE tenant_id=? AND calendar_id=? AND calendar_version=? AND status='UNKNOWN'",providerMessageId,tenantId,id,version);
  }
  reconcile(tenantId:string,id:string,version:number,providerMessageId:string,evidenceReference:string,actor:string):void {
    const rows=Array.from(this.sql.exec('SELECT status FROM emp002_native_reminder_actions WHERE tenant_id = ? AND calendar_id = ? AND calendar_version = ?',tenantId,id,version));
    if(rows.length!==1 || rows[0].status!=='UNKNOWN') throw new Error('EMP002_REMINDER_RECONCILIATION_CONFLICT');
    this.sql.exec("UPDATE emp002_native_reminder_actions SET status='SENT', provider_message_id=?, evidence_reference=?, reconciled_by=? WHERE tenant_id=? AND calendar_id=? AND calendar_version=? AND status='UNKNOWN'",providerMessageId,evidenceReference,actor,tenantId,id,version);
  }
}
