export type WhatsAppAudience = 'OWNER' | 'TEAM' | 'EXTERNAL_CONTACT';

export interface WhatsAppMessage {
  tenantId: string;
  correlationId: string;
  to: string;
  body: string;
  audience: WhatsAppAudience;
  idempotencyKey: string;
}

export interface WhatsAppResult {
  ok: boolean;
  provider: 'meta-cloud-api';
  messageId: string | null;
  status: number;
  tenantId: string;
  correlationId: string;
}

export interface WhatsAppTransport {
  sendText(message: WhatsAppMessage): Promise<WhatsAppResult>;
}

export function normalizeWhatsAppNumber(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/^whatsapp:/i, '')
    .replace(/[^\d]/g, '');

  if (!/^[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Invalid WhatsApp number');
  }
  return normalized;
}
