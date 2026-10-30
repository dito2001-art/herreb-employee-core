import { EMP002Operations } from '../src/runtime/emp002-operations';

type Env = { EMP002_OPERATIONS: DurableObjectNamespace; EMP002_RECONCILIATION_TOKEN: string; TENANT_MANIFESTS_JSON: string; META_ACCESS_TOKEN: string; META_PHONE_NUMBER_ID: string };
let mode: 'success'|'timeout'|'pause' = 'success';
let sends = 0;
let release: (()=>void)|undefined;
let paused: Promise<void>|undefined;

const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('https://graph.facebook.com/')) throw new Error('EMP002_TEST_OUTBOUND_NETWORK_FORBIDDEN:'+url);
  sends++;
  if (mode === 'pause') {
    paused = new Promise<void>(resolve => { release = resolve; });
    await paused;
  }
  if (mode === 'timeout') throw new Error('EMP002_TEST_META_TIMEOUT');
  return Response.json({messages:[{id:'wamid.test-1234'}]});
}) as typeof nativeFetch;

export { EMP002Operations };
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__test/control' && request.method === 'POST') {
      const data = await request.json<{mode?:typeof mode; release?:boolean; reset?:boolean}>();
      if (data.reset) { sends=0; mode='success'; }
      if (data.mode) mode=data.mode;
      if (data.release) { release?.(); release=undefined; }
      return Response.json({sends,paused:!!release,mode});
    }
    if (url.pathname !== '/__test/do' || request.method !== 'POST') return new Response('Not found',{status:404});
    const data = await request.json<{tenant:string;path:string;body?:unknown;token?:string;headerTenant?:string}>();
    if (!['tenant-a','tenant-b'].includes(data.tenant)) return new Response('Unknown test tenant',{status:403});
    const id=env.EMP002_OPERATIONS.idFromName('tenant:'+data.tenant);
    const headers = new Headers({'content-type':'application/json','x-herreb-internal-tenant-id':data.headerTenant??data.tenant});
    if(data.token !== 'omit') headers.set('x-emp002-reconciliation-token',data.token??env.EMP002_RECONCILIATION_TOKEN);
    if(data.path.endsWith('/reconcile')) headers.set('x-herreb-reconciliation-actor','test-operator');
    return env.EMP002_OPERATIONS.get(id).fetch(new Request('https://internal'+data.path,{method:'POST',headers,body:JSON.stringify(data.body??{})}));
  }
};
