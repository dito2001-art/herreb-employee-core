import {
  normalizeWhatsAppNumber,
  type WhatsAppMessage,
  type WhatsAppResult,
  type WhatsAppTransport,
} from './whatsapp';

export interface MetaWhatsAppEnv {
  META_ACCESS_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  META_GRAPH_VERSION?: string;
  META_API_VERSION?: string;
}

interface MetaWhatsAppResponse {
  messages?: Array<{ id?: string }>;
  [key: string]: unknown;
}

function parseMetaResponse(raw: string): MetaWhatsAppResponse | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as MetaWhatsAppResponse) : null;
  } catch {
    return null;
  }
}

export class MetaWhatsAppTransport implements WhatsAppTransport {
  constructor(private readonly env: MetaWhatsAppEnv) {}

  async sendText(message: WhatsAppMessage): Promise<WhatsAppResult> {
    if (!message.tenantId) throw new Error('tenantId required');
    if (!message.correlationId) throw new Error('correlationId required');
    if (!message.idempotencyKey) throw new Error('idempotencyKey required');
    if (!message.body?.trim()) throw new Error('body required');
    if (!this.env.META_ACCESS_TOKEN || !this.env.META_PHONE_NUMBER_ID) {
      throw new Error('Meta credentials missing');
    }

    const to = normalizeWhatsAppNumber(message.to);
    const version = this.env.META_GRAPH_VERSION || this.env.META_API_VERSION || 'v26.0';
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(this.env.META_PHONE_NUMBER_ID)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.META_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: message.body },
        }),
      },
    );

    const raw = await response.text();
    const data = parseMetaResponse(raw);

    if (!response.ok) {
      throw new Error(`META_WHATSAPP_HTTP_ERROR:${response.status}`);
    }

    const messageId = data?.messages?.[0]?.id?.trim();
    if (!messageId) {
      throw new Error('META_WHATSAPP_PROVIDER_EVIDENCE_MISSING');
    }

    return {
      ok: true,
      provider: 'meta-cloud-api',
      messageId,
      status: response.status,
      tenantId: message.tenantId,
      correlationId: message.correlationId,
    };
  }
}
