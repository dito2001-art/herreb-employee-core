import type { SchedulingSqlStorage } from './emp002-scheduling-store';
import { normalizeDispatchWhatsapp } from './emp002-whatsapp-dispatch-store';

export type EMP002WhatsAppConversationRole = 'user' | 'assistant';

export interface EMP002WhatsAppConversationMessage {
  role: EMP002WhatsAppConversationRole;
  content: string;
  at: string;
  messageId?: string;
}

export interface EMP002WhatsAppConversation {
  tenantId: string;
  whatsapp: string;
  messages: EMP002WhatsAppConversationMessage[];
  updatedAt: string;
}

const MAX_MESSAGES = 30;

export class SqliteEMP002WhatsAppConversationStore {
  constructor(private readonly sql: SchedulingSqlStorage) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_whatsapp_conversation (
      tenant_id TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (tenant_id, whatsapp)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS emp002_whatsapp_inbound_seen (
      tenant_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, message_id)
    )`);
  }

  async get(tenantId: string, whatsapp: string): Promise<EMP002WhatsAppConversation> {
    const normalized = normalizeDispatchWhatsapp(whatsapp);
    const rows = Array.from(this.sql.exec(
      `SELECT payload FROM emp002_whatsapp_conversation WHERE tenant_id = ? AND whatsapp = ?`,
      tenantId,
      normalized,
    ));
    if (!rows.length) return { tenantId, whatsapp: normalized, messages: [], updatedAt: new Date(0).toISOString() };
    const payload = rows[0].payload;
    if (typeof payload !== 'string') throw new Error('EMP002_WHATSAPP_CONVERSATION_INVALID_STATE');
    const conversation = JSON.parse(payload) as EMP002WhatsAppConversation;
    if (conversation.tenantId !== tenantId || normalizeDispatchWhatsapp(conversation.whatsapp) !== normalized) {
      throw new Error('EMP002_WHATSAPP_CONVERSATION_TENANT_MISMATCH');
    }
    return conversation;
  }

  async append(
    tenantId: string,
    whatsapp: string,
    message: EMP002WhatsAppConversationMessage,
  ): Promise<EMP002WhatsAppConversation> {
    const current = await this.get(tenantId, whatsapp);
    const normalized = normalizeDispatchWhatsapp(whatsapp);
    const next: EMP002WhatsAppConversation = {
      tenantId,
      whatsapp: normalized,
      messages: [...current.messages, message].slice(-MAX_MESSAGES),
      updatedAt: message.at,
    };
    this.sql.exec(
      `INSERT INTO emp002_whatsapp_conversation (tenant_id, whatsapp, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(tenant_id, whatsapp) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`,
      tenantId,
      normalized,
      next.updatedAt,
      JSON.stringify(next),
    );
    return next;
  }

  async markInboundOnce(tenantId: string, messageId: string, receivedAt: string): Promise<boolean> {
    const existing = Array.from(this.sql.exec(
      `SELECT message_id FROM emp002_whatsapp_inbound_seen WHERE tenant_id = ? AND message_id = ?`,
      tenantId,
      messageId,
    ));
    if (existing.length) return false;
    this.sql.exec(
      `INSERT INTO emp002_whatsapp_inbound_seen (tenant_id, message_id, received_at) VALUES (?, ?, ?)`,
      tenantId,
      messageId,
      receivedAt,
    );
    return true;
  }
}
