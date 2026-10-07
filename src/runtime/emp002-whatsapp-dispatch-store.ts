import type { AutonomousSchedulingState } from './emp002-autonomous-scheduling';
import type { WaitlistRequest } from './emp002-scheduling';

export interface WhatsAppSchedulingDispatchRecord {
  tenantId: string;
  contactId: string;
  whatsapp: string;
  displayName?: string;
  email?: string;
  ownerWhatsapp?: string;
  timezone: string;
  state: AutonomousSchedulingState;
  requests: WaitlistRequest[];
}

export interface WhatsAppSchedulingDispatchStore {
  findByWhatsapp(tenantId: string, whatsapp: string): Promise<WhatsAppSchedulingDispatchRecord | undefined>;
  findActiveByWhatsapp(tenantId: string, whatsapp: string): Promise<WhatsAppSchedulingDispatchRecord | undefined>;
  save(record: WhatsAppSchedulingDispatchRecord): Promise<void>;
}

export function normalizeDispatchWhatsapp(value: string): string {
  return String(value || '').trim().replace(/^whatsapp:/i, '').replace(/[^\d]/g, '');
}

export class InMemoryWhatsAppSchedulingDispatchStore implements WhatsAppSchedulingDispatchStore {
  private readonly records = new Map<string, WhatsAppSchedulingDispatchRecord>();
  private key(tenantId: string, whatsapp: string) { return `${tenantId}:${normalizeDispatchWhatsapp(whatsapp)}`; }
  async findByWhatsapp(tenantId: string, whatsapp: string) {
    return this.records.get(this.key(tenantId, whatsapp));
  }
  async findActiveByWhatsapp(tenantId: string, whatsapp: string) {
    const record = await this.findByWhatsapp(tenantId, whatsapp);
    return record?.state.recovery?.status === 'OFFER_PENDING' ? record : undefined;
  }
  async save(record: WhatsAppSchedulingDispatchRecord) {
    this.records.set(this.key(record.tenantId, record.whatsapp), record);
  }
}
