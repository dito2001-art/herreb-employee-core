import employeeServer from './server';
import { handleMetaWhatsAppWebhook } from './runtime';

interface OperationsNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

type WorkerEnv = Env & {
  META_VERIFY_TOKEN?: string;
  WHATSAPP_TENANT_ROUTES_JSON?: string;
  EMP002_OPERATIONS?: OperationsNamespace;
};

export { ChatAgent } from './server';
export { EMP002Operations } from './runtime/emp002-operations';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/webhooks/meta/whatsapp') {
      const runtimeEnv = env as WorkerEnv;
      return handleMetaWhatsAppWebhook(request, runtimeEnv, async (message) => {
        if (!runtimeEnv.EMP002_OPERATIONS) throw new Error('EMP002_OPERATIONS_BINDING_MISSING');
        // One durable object instance per tenant. External WhatsApp traffic can
        // never inherit or address an owner's ChatAgent session.
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
