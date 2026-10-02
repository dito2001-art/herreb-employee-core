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

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' ? (value as JsonRecord) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseTenantRoutes(raw?: string): WhatsAppTenantRoute[] {
  if (!raw?.trim()) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('WHATSAPP_TENANT_ROUTES_JSON must be an array');
  return parsed.filter((item): item is WhatsAppTenantRoute => {
    const record = asRecord(item);
    return Boolean(
      record &&
        typeof record.tenantId === 'string' &&
        record.tenantId.trim() &&
        typeof record.phoneNumberId === 'string' &&
        record.phoneNumberId.trim(),
    );
  });
}

export function extractMetaTextMessages(payload: unknown): MetaWebhookMessage[] {
  const output: MetaWebhookMessage[] = [];
  const root = asRecord(payload);

  for (const entryValue of asArray(root?.entry)) {
    const entry = asRecord(entryValue);
    for (const changeValue of asArray(entry?.changes)) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      const metadata = asRecord(value?.metadata);
      const phoneNumberId =
        typeof metadata?.phone_number_id === 'string' ? metadata.phone_number_id : undefined;

      for (const messageValue of asArray(value?.messages)) {
        const message = asRecord(messageValue);
        const text = asRecord(message?.text);
        const body = text?.body;
        const id = message?.id;
        const from = message?.from;
        const timestamp = message?.timestamp;

        if (
          message?.type !== 'text' ||
          typeof body !== 'string' ||
          typeof id !== 'string' ||
          !id ||
          typeof from !== 'string' ||
          !from
        ) {
          continue;
        }

        output.push({
          id,
          from,
          body,
          timestamp: typeof timestamp === 'string' ? timestamp : undefined,
          phoneNumberId,
        });
      }
    }
  }
  return output;
}

export function resolveWebhookTenant(
  phoneNumberId: string | undefined,
  routes: WhatsAppTenantRoute[],
): string | undefined {
  if (!phoneNumberId) return undefined;
  return routes.find((route) => route.phoneNumberId === phoneNumberId)?.tenantId;
}

export function verifyMetaWebhook(
  requestUrl: string,
  verifyToken: string | undefined,
): Response | undefined {
  const url = new URL(requestUrl);
  if (url.searchParams.get('hub.mode') !== 'subscribe') return undefined;
  const supplied = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (!verifyToken || supplied !== verifyToken || challenge === null)
    return new Response('Forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}
