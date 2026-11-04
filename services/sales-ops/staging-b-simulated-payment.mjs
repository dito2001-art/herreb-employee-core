import sales from './worker.js';

const TENANT = 'herreb-client-b';
const CUSTOMER = 'WF01-B-DEMO-001';
const SKUS = new Set(['WF01-B-ESCRITORIO-001', 'WF01-B-SILLA-001']);
const enabled = env => env.DEPLOYMENT_ENV === 'staging-b' && env.SIMULATED_PAYMENT_ENABLED === 'true';
const json = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'no-store'}});

// Dedicated staging entry; the ordinary Sales Ops entry and real payment states stay unchanged.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Separate panel credential: only B configuration, never orders or payments.
    const panelCredential = env.EMP001_CONFIG_B_TOKEN;
    if (panelCredential && request.headers.get('authorization') === `Bearer ${panelCredential}`) {
      if (!enabled(env) || request.headers.get('x-tenant-id') !== TENANT ||
          url.pathname !== '/api/v1/tenant-operations' || !['GET','PUT'].includes(request.method))
        return json({ok:false,error:'CONFIGURATION_CREDENTIAL_SCOPE_FORBIDDEN'},403);
      // Request-local credential context: the panel must not depend on legacy
      // seller tokens or duplicate entries in their credential registry.
      env = {...env,
        SALES_OPS_CREDENTIALS_JSON: JSON.stringify([{token:panelCredential,tenantId:TENANT}]),
        EMP001_API_TOKEN: undefined, EMP001_API_TOKEN_TENANT_ID: undefined,
        EMP001_B_API_TOKEN: undefined};
    }
    const match = url.pathname.match(/^\/api\/v1\/orders\/([^/]+)\/simulated-payment$/);
    if (enabled(env) && request.method === 'POST' && /^\/api\/v1\/orders\/[^/]+\/state$/.test(url.pathname)) {
      const checkUrl=new URL(request.url); checkUrl.pathname=checkUrl.pathname.replace(/\/state$/,'');
      const checked=await sales.fetch(new Request(checkUrl,{headers:request.headers}),env);
      if (!checked.ok) return checked;
      const data=await checked.json();
      if (data.order?.tenant_id === TENANT && data.order.customer_id === CUSTOMER)
        return json({ok:false,error:'REAL_PAYMENT_DISABLED_FOR_SIMULATION'},403);
    }
    if (!match) {
      const response = await sales.fetch(request, env);
      if (request.method !== 'GET' || url.pathname !== '/api/v1/tenant-operations' || !response.ok || !enabled(env)) return response;
      const data = await response.json();
      if (data.tenant_id !== TENANT) return json(data);
      // No bank data or treasury contact is exposed in the simulation profile.
      const configurable = Object.fromEntries(Object.entries(data.operations || {}).filter(([key,value]) =>
        ['pickupLocation','pickupHours','deliveryCoverage','deliveryInstructions'].includes(key)
          ? typeof value === 'string' && value.length <= 1000
          : key === 'deliveryCostGs' && Number.isSafeInteger(value) && value >= 0));
      return json({...data, operations:{...configurable,paymentMode:'SIMULATED', paymentMethods:'PAGO SIMULADO / PRUEBA',
        simulation:{tenantId:TENANT,customerId:CUSTOMER},internalEscalation:'disabled'}});
    }
    if (!enabled(env)) return json({ok:false,error:'SIMULATION_DISABLED'},404);
    if (request.method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    const readUrl = new URL(request.url); readUrl.pathname = '/api/v1/orders/' + match[1];
    const read = () => sales.fetch(new Request(readUrl, {headers:request.headers}),env);
    const authorized = await read();
    if (!authorized.ok) return authorized; // Existing credential -> tenant checks remain authoritative.
    const {order} = await authorized.json();
    if (order?.tenant_id !== TENANT || request.headers.get('x-tenant-id') !== TENANT || order.customer_id !== CUSTOMER ||
        !order.lines?.length || order.lines.some(line=>!SKUS.has(line.sku))) return json({ok:false,error:'SIMULATION_SCOPE_FORBIDDEN'},403);
    let input; try { input = await request.json(); } catch { return json({ok:false,error:'INVALID_JSON'},400); }
    if (JSON.stringify(input) !== '{}') return json({ok:false,error:'SIMULATION_FIELDS_FORBIDDEN'},400);
    if (order.status !== 'PAYMENT_PENDING') return json({ok:false,error:'SIMULATION_STATE_CONFLICT'},409);
    let evidence; try { evidence = JSON.parse(order.evidence_json || '{}'); } catch { return json({ok:false,error:'INVALID_ORDER_EVIDENCE'},409); }
    if (evidence.simulated_payment) {
      const saved=evidence.simulated_payment;
      if (saved.status !== 'SIMULATED' || saved.realPayment !== false || saved.tenantId !== TENANT || saved.customerId !== CUSTOMER)
        return json({ok:false,error:'SIMULATION_EVIDENCE_CONFLICT'},409);
      return read();
    }
    const next = JSON.stringify({...evidence,simulated_payment:{status:'SIMULATED',realPayment:false,tenantId:TENANT,customerId:CUSTOMER}});
    const timestamp = new Date().toISOString();
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE orders SET evidence_json=?,updated_at=? WHERE tenant_id=? AND id=? AND customer_id=? AND status='PAYMENT_PENDING' AND evidence_json IS ?")
        .bind(next,timestamp,TENANT,order.id,CUSTOMER,order.evidence_json ?? null),
      env.DB.prepare('INSERT INTO audit_log(id,tenant_id,ts,actor,action,entity_type,entity_id,payload_json) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1')
        .bind(crypto.randomUUID(),TENANT,timestamp,'STAGING_B_TEST','PAYMENT_SIMULATED','order',order.id,JSON.stringify({realPayment:false}))
    ]);
    const changed = result[0]?.meta?.changes ?? result[0]?.changes;
    const verified = await read();
    if (!verified.ok) return verified;
    const body = await verified.json();
    let saved; try { saved=JSON.parse(body.order?.evidence_json || '{}').simulated_payment; } catch {}
    if (body.order?.status !== 'PAYMENT_PENDING' || saved?.status !== 'SIMULATED' || saved.realPayment !== false || saved.tenantId !== TENANT || saved.customerId !== CUSTOMER)
      return json({ok:false,error:changed===1?'SIMULATION_READBACK_FAILED':'SIMULATION_CAS_CONFLICT'},409);
    return json({...body,replayed:changed!==1});
  }
};
