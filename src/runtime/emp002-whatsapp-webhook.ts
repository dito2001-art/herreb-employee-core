export interface MetaWebhookMessage {
  id: string;
  from: string;
  body: string;
  timestamp?: string;
  phoneNumberId?: string;
}

export interface WhatsAppTenantRoute {
  tenantId: string;
  phoneNumberId: string;
}

export function parseTenantRoutes(raw?: string): WhatsAppTenantRoute[] {
  if (!raw?.trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('WHATSAPP_TENANT_ROUTES_JSON must be an array');
  return parsed.filter((item): item is WhatsAppTenantRoute =>
    Boolean(item && typeof item.tenantId === 'string' && item.tenantId.trim() && typeof item.phoneNumberId === 'string' && item.phoneNumberId.trim())
  );
}

export function extractMetaTextMessages(payload: any): MetaWebhookMessage[] {
  const output: MetaWebhookMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      for (const message of value?.messages ?? []) {
        const body = message?.text?.body;
        if (message?.type !== 'text' || typeof body !== 'string' || !message?.id || !message?.from) continue;
        output.push({ id: message.id, from: message.from, body, timestamp: message.timestamp, phoneNumberId });
      }
    }
  }
  return output;
}

export function resolveWebhookTenant(phoneNumberId: string | undefined, routes: WhatsAppTenantRoute[]): string | undefined {
  if (!phoneNumberId) return undefined;
  return routes.find((route) => route.phoneNumberId === phoneNumberId)?.tenantId;
}

export function verifyMetaWebhook(requestUrl: string, verifyToken: string | undefined): Response | undefined {
  const url = new URL(requestUrl);
  if (url.searchParams.get('hub.mode') !== 'subscribe') return undefined;
  const supplied = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (!verifyToken || supplied !== verifyToken || challenge === null) return new Response('Forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}
