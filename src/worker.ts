import employeeServer from './server';
import { extractMetaTextMessages, handleMetaWhatsAppWebhook } from './runtime';

interface OperationsNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface ServiceFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type WorkerEnv = Env & {
  META_VERIFY_TOKEN?: string;
  WHATSAPP_TENANT_ROUTES_JSON?: string;
  EMP002_OWNER_WHATSAPP?: string;
  EMP002_OPERATIONS?: OperationsNamespace;
  EMP001_WHATSAPP?: ServiceFetcher;
  WORKFORCE_ADMIN_STATE?: OperationsNamespace;
  TENANT_MANIFESTS_JSON?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
};

function normalizeWhatsAppNumber(value?: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

export { ChatAgent } from './server';
export { EMP002Operations } from './runtime/emp002-operations';
export { WorkforceAdminState } from './runtime/workforce-admin-state';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const runtimeEnv = env as WorkerEnv;

    if (url.pathname === '/api/admin/workforce') {
      if (!runtimeEnv.WORKFORCE_ADMIN_STATE) {
        return Response.json({ ok: false, error: 'WORKFORCE_ADMIN_STATE_BINDING_MISSING' }, { status: 503 });
      }
      const id = runtimeEnv.WORKFORCE_ADMIN_STATE.idFromName('global');
      const stub = runtimeEnv.WORKFORCE_ADMIN_STATE.get(id);
      if (request.method === 'GET') {
        return stub.fetch('https://workforce.admin/state', { method: 'GET' });
      }
      if (request.method === 'POST') {
        const authenticatedEmail = request.headers.get('cf-access-authenticated-user-email');
        const headers = new Headers({ 'content-type': request.headers.get('content-type') ?? 'application/json' });
        if (authenticatedEmail) headers.set('cf-access-authenticated-user-email', authenticatedEmail);
        return stub.fetch('https://workforce.admin/mutate', {
          method: 'POST',
          headers,
          body: request.body,
        });
      }
      return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET, POST' } });
    }

    if (url.pathname === '/webhooks/meta/whatsapp') {
      if (request.method === 'GET') {
        return handleMetaWhatsAppWebhook(request, runtimeEnv, async () => undefined);
      }

      if (request.method === 'POST') {
        const payload = await request.clone().json().catch(() => undefined);
        const inbound = extractMetaTextMessages(payload);
        const owner = normalizeWhatsAppNumber(runtimeEnv.EMP002_OWNER_WHATSAPP);
        const hasOwnerMessage = Boolean(owner) && inbound.some((message) => normalizeWhatsAppNumber(message.from) === owner);
        const hasExternalMessage = inbound.some((message) => normalizeWhatsAppNumber(message.from) !== owner);

        if (hasExternalMessage && !hasOwnerMessage) {
          if (!runtimeEnv.EMP001_WHATSAPP) throw new Error('EMP001_WHATSAPP_BINDING_MISSING');
          return runtimeEnv.EMP001_WHATSAPP.fetch('https://emp001.internal/webhooks/meta/whatsapp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      }

      return handleMetaWhatsAppWebhook(request, runtimeEnv, async (message) => {
        if (!runtimeEnv.EMP002_OPERATIONS) throw new Error('EMP002_OPERATIONS_BINDING_MISSING');
        const id = runtimeEnv.EMP002_OPERATIONS.idFromName(`tenant:${message.tenantId}`);
        const stub = runtimeEnv.EMP002_OPERATIONS.get(id);
        const response = await stub.fetch('https://emp002.operations/inbound/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(message),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`EMP002_OPERATIONS_DISPATCH_FAILED:${response.status}:${detail}`);
        }
      });
    }
    return employeeServer.fetch(request, env, ctx);
  },
};
