import employeeServer from './server';
import { handleMetaWhatsAppWebhook } from './runtime';

type WorkerEnv = Env & {
  META_VERIFY_TOKEN?: string;
  WHATSAPP_TENANT_ROUTES_JSON?: string;
};

export { ChatAgent } from './server';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/webhooks/meta/whatsapp') {
      return handleMetaWhatsAppWebhook(request, env as WorkerEnv, async (message) => {
        // The HTTP edge is deliberately independent from Cloudflare Access.
        // Tenant routing has already been resolved from Meta phone_number_id.
        // Persisted scheduling-state dispatch is wired separately so an
        // unauthenticated webhook can never inherit an owner web session.
        console.log(JSON.stringify({
          event: 'EMP002_WHATSAPP_INBOUND',
          tenantId: message.tenantId,
          messageId: message.messageId,
          from: message.from,
          receivedAt: message.receivedAt,
        }));
      });
    }
    return employeeServer.fetch(request, env, ctx);
  },
};
