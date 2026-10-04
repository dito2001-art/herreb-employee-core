import employeeServer from './server';
import { extractMetaTextMessages, handleMetaWhatsAppWebhook } from './runtime';

interface OperationsNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface ServiceFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type WorkforceAdminResolvedActor = {
  email: string;
  actorId: string;
  tenantId: string;
  role: 'owner' | 'user';
};

type WorkerEnv = Env & {
  META_VERIFY_TOKEN?: string;
  WHATSAPP_TENANT_ROUTES_JSON?: string;
  EMP002_OWNER_WHATSAPP?: string;
  EMP002_OPERATIONS?: OperationsNamespace;
  EMP001_WHATSAPP?: ServiceFetcher;
  WORKFORCE_ADMIN_STATE?: OperationsNamespace;
  WORKFORCE_ADMIN_M2M_TOKEN?: string;
  TENANT_MANIFESTS_JSON?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
};

function normalizeWhatsAppNumber(value?: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

function configuredAdminIdentities(env: WorkerEnv): WorkforceAdminResolvedActor[] {
  try {
    const identities = JSON.parse(env.ACCESS_IDENTITY_MAP_JSON ?? '[]') as Array<{
      email?: string;
      actorId?: string;
      tenantId?: string;
      role?: string;
    }>;
    return identities.flatMap((identity) => {
      const email = identity.email?.trim().toLowerCase();
      const actorId = identity.actorId?.trim();
      const tenantId = identity.tenantId?.trim();
      const role = identity.role === 'owner' ? 'owner' : identity.role === 'user' ? 'user' : undefined;
      return email && actorId && tenantId && role ? [{ email, actorId, tenantId, role }] : [];
    });
  } catch {
    return [];
  }
}

function resolveWorkforceAdminActor(request: Request, env: WorkerEnv): WorkforceAdminResolvedActor | undefined {
  const identities = configuredAdminIdentities(env);
  const accessEmail = request.headers.get('cf-access-authenticated-user-email')?.trim().toLowerCase();
  if (accessEmail) return identities.find((identity) => identity.email === accessEmail);

  const expectedToken = env.WORKFORCE_ADMIN_M2M_TOKEN;
  const suppliedToken = request.headers.get('x-herreb-workforce-admin-token');
  if (!expectedToken || !suppliedToken || !constantTimeEqual(expectedToken, suppliedToken)) return undefined;

  return identities.find((identity) => identity.role === 'owner');
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
        const actor = resolveWorkforceAdminActor(request, runtimeEnv);
        const headers = new Headers({ 'content-type': request.headers.get('content-type') ?? 'application/json' });
        if (actor) {
          headers.set('cf-access-authenticated-user-email', actor.email);
          headers.set('x-herreb-internal-actor-id', actor.actorId);
          headers.set('x-herreb-internal-tenant-id', actor.tenantId);
          headers.set('x-herreb-internal-role', actor.role);
        }
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
