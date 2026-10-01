import { extractMetaTextMessages, parseTenantRoutes, resolveWebhookTenant, verifyMetaWebhook } from './emp002-whatsapp-webhook';

export interface WhatsAppWebhookEnv {
  META_VERIFY_TOKEN?: string;
  WHATSAPP_TENANT_ROUTES_JSON?: string;
}

export interface RoutedWhatsAppInbound {
  tenantId: string;
  messageId: string;
  from: string;
  body: string;
  receivedAt: string;
  phoneNumberId?: string;
}

export type WhatsAppInboundDispatcher = (message: RoutedWhatsAppInbound) => Promise<void>;

export async function handleMetaWhatsAppWebhook(
  request: Request,
  env: WhatsAppWebhookEnv,
  dispatch: WhatsAppInboundDispatcher,
): Promise<Response> {
  if (request.method === 'GET') {
    return verifyMetaWebhook(request.url, env.META_VERIFY_TOKEN) ?? new Response('Bad request', { status: 400 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let payload: any;
  try { payload = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  let routes;
  try { routes = parseTenantRoutes(env.WHATSAPP_TENANT_ROUTES_JSON); } catch { return new Response('Invalid tenant routing config', { status: 500 }); }

  const messages = extractMetaTextMessages(payload);
  for (const message of messages) {
    const tenantId = resolveWebhookTenant(message.phoneNumberId, routes);
    if (!tenantId) continue;
    const receivedAt = message.timestamp && /^\d+$/.test(message.timestamp)
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    await dispatch({ tenantId, messageId: message.id, from: message.from, body: message.body, receivedAt, phoneNumberId: message.phoneNumberId });
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}
