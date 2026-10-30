import { verifyWorkforceAccessJwt } from '../src/runtime/workforce-admin-access-jwt';
import { resolveAccessIdentity } from '../src/runtime/access-identity';
import { EMP002Operations as BaseEMP002Operations } from '../src/runtime/emp002-operations';

type Env = {
  EMP002_OPERATIONS: DurableObjectNamespace;
  EMP002_STAGING_ACCESS_ISSUER?: string;
  EMP002_STAGING_ACCESS_AUDIENCE?: string;
  EMP002_STAGING_TRUSTED_JWKS_JSON?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
  TENANT_MANIFESTS_JSON?: string;
  EMP002_RECONCILIATION_TOKEN?: string;
};
// Defense in depth: even direct DO stub callers cannot invoke outbound-capable handlers.
// Strip Meta credentials from the DO environment, regardless of accidental bindings.
export class EMP002Operations extends BaseEMP002Operations {
  private readonly stagingId: DurableObjectId;
  private readonly stagingNamespace?: DurableObjectNamespace;
  constructor(state: DurableObjectState, env: ConstructorParameters<typeof BaseEMP002Operations>[1]) {
    super(state, { ...env, META_ACCESS_TOKEN: undefined, META_PHONE_NUMBER_ID: undefined });
    this.stagingId = state.id;
    this.stagingNamespace = (env as {EMP002_OPERATIONS?: DurableObjectNamespace}).EMP002_OPERATIONS;
  }
  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || (path !== '/native-calendar' && path !== '/internal/native-reminders/status')) {
      return Response.json({ok:false,error:'STAGING_DO_OPERATION_FORBIDDEN'},{status:403});
    }
    const tenantId = request.headers.get('x-herreb-internal-tenant-id');
    if (!tenantId || !/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId) || !this.stagingNamespace ||
        this.stagingNamespace.idFromName('tenant:'+tenantId).toString() !== this.stagingId.toString()) {
      return Response.json({ok:false,error:'STAGING_DO_TENANT_FORBIDDEN'},{status:403});
    }
    return super.fetch(request);
  }
}

// Deliberately narrow: no webhook, execute, claim, reconcile, or outbound transport.
const ALLOWED = new Map([
  ['/staging/emp002/calendar', '/native-calendar'],
  ['/staging/emp002/reminder-status', '/internal/native-reminders/status'],
]);
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !ALLOWED.has(path)) return new Response('Not found', { status: 404 });
    if (!env.EMP002_OPERATIONS || !env.EMP002_STAGING_ACCESS_ISSUER || !env.EMP002_STAGING_ACCESS_AUDIENCE ||
        !env.EMP002_STAGING_TRUSTED_JWKS_JSON || !env.ACCESS_IDENTITY_MAP_JSON || !env.TENANT_MANIFESTS_JSON) {
      return Response.json({ok:false,error:'STAGING_NOT_CONFIGURED'},{status:503});
    }
    const jwt = request.headers.get('cf-access-jwt-assertion');
    if (!jwt) return Response.json({ok:false,error:'ACCESS_REQUIRED'},{status:403});
    try {
      const jwks = JSON.parse(env.EMP002_STAGING_TRUSTED_JWKS_JSON);
      const principal = await verifyWorkforceAccessJwt({
        jwt, issuer:env.EMP002_STAGING_ACCESS_ISSUER, audience:env.EMP002_STAGING_ACCESS_AUDIENCE,
        jwks, nowSeconds:Math.floor(Date.now()/1000)
      });
      const identity = resolveAccessIdentity(principal.email, env.ACCESS_IDENTITY_MAP_JSON);
      const manifests:unknown = JSON.parse(env.TENANT_MANIFESTS_JSON);
      if (!identity || !Array.isArray(manifests) || !manifests.some((m:unknown) =>
        !!m && typeof m === 'object' && (m as {tenantId?:string}).tenantId === identity.tenantId)) {
        return Response.json({ok:false,error:'TENANT_FORBIDDEN'},{status:403});
      }
      if (request.headers.has('x-herreb-internal-tenant-id') || request.headers.has('x-emp002-reconciliation-token')) {
        return Response.json({ok:false,error:'CLIENT_SCOPE_HEADERS_FORBIDDEN'},{status:403});
      }
      const origin = request.headers.get('origin');
      if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
        return Response.json({ok:false,error:'STAGING_ORIGIN_FORBIDDEN'},{status:403});
      }
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return Response.json({ok:false,error:'STAGING_JSON_REQUIRED'},{status:415});
      }
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > 65536) return Response.json({ok:false,error:'PAYLOAD_TOO_LARGE'},{status:413});
      let parsed: unknown;
      try { parsed = JSON.parse(body); }
      catch { return Response.json({ok:false,error:'STAGING_INVALID_JSON'},{status:400}); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Response.json({ok:false,error:'STAGING_INVALID_BODY'},{status:400});
      if (path.endsWith('/calendar') && (parsed as {operation?:unknown}).operation === 'save' && identity.role !== 'owner') {
        return Response.json({ok:false,error:'STAGING_WRITE_FORBIDDEN'},{status:403});
      }
      if (path.endsWith('/reminder-status') && !env.EMP002_RECONCILIATION_TOKEN) {
        return Response.json({ok:false,error:'STAGING_NOT_CONFIGURED'},{status:503});
      }
      const headers = new Headers({'content-type':'application/json','x-herreb-internal-tenant-id':identity.tenantId});
      if (path.endsWith('/reminder-status')) headers.set('x-emp002-reconciliation-token',env.EMP002_RECONCILIATION_TOKEN!);
      const id=env.EMP002_OPERATIONS.idFromName('tenant:'+identity.tenantId);
      const response = await env.EMP002_OPERATIONS.get(id).fetch(new Request('https://emp002.staging.internal'+ALLOWED.get(path),{
        method:'POST',headers,body
      }));
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('cache-control','private, no-store');
      return new Response(response.body,{status:response.status,headers:responseHeaders});
    } catch {
      return Response.json({ok:false,error:'ACCESS_DENIED'},{status:403});
    }
  }
};
