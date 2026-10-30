import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './worker.js';
function fixture() {
 const db = new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY,active INT); CREATE TABLE products(sku TEXT,tenant_id TEXT,name TEXT,active INT,stock_qty INT); CREATE TABLE quotes(id TEXT,tenant_id TEXT,customer_id TEXT,status TEXT,quote_json TEXT,total_gs INT); CREATE TABLE orders(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT,quote_id TEXT,status TEXT,total_gs INT,created_at TEXT,updated_at TEXT,evidence_json TEXT); CREATE TABLE order_lines(id TEXT PRIMARY KEY,tenant_id TEXT,order_id TEXT,sku TEXT,name TEXT,qty INT,unit_price_gs INT,line_total_gs INT); CREATE TABLE audit_log(id TEXT PRIMARY KEY,tenant_id TEXT,ts TEXT,actor TEXT,action TEXT,entity_type TEXT,entity_id TEXT,payload_json TEXT);`);
 db.exec(readFileSync(new URL('./migrations/0001_order_create_operations.sql',import.meta.url),'utf8'));
 for(const tenant of ['tenant-a','tenant-b']) {
 db.prepare('INSERT INTO tenants VALUES(?,1)').run(tenant);
 db.prepare('INSERT INTO products VALUES(?,?,?,1,10)').run('SKU',tenant,'Product');
 db.prepare('INSERT INTO quotes VALUES(?,?,?,?,?,100)').run('Q1',tenant,'customer','OPEN',JSON.stringify({lines:[{sku:'SKU',name:'Product',qty:2,unit_price_gs:50,line_total_gs:100}]}));
 }
 const prepare = (query) => ({ bind(...args) { return { query,args, async first(){return db.prepare(query).get(...args)??null;},async all(){return {results:db.prepare(query).all(...args)};},async run(){return db.prepare(query).run(...args);} }; } });
 const env = { SALES_OPS_CREDENTIALS_JSON: JSON.stringify([{token:'a',tenantId:'tenant-a'},{token:'b',tenantId:'tenant-b'}]), DB:{prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>db.prepare(s.query).run(...s.args));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}} };
 const request=(tenant='tenant-a',operation='op1',quote='Q1')=>new Request('https://sales.test/api/v1/orders',{method:'POST',headers:{authorization:`Bearer ${tenant==='tenant-a'?'a':'b'}`,'x-tenant-id':tenant,'content-type':'application/json'},body:JSON.stringify({operation_id:operation,quote_id:quote})});
 return {db,env,request};
}
test('concurrent duplicate consumers persist one order, one stock change and audit; independent GET',async()=>{const f=fixture();const results=await Promise.all([worker.fetch(f.request(),f.env),worker.fetch(f.request(),f.env)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);const bodies=await Promise.all(results.map(r=>r.json()));assert.equal(bodies[0].order.id,bodies[1].order.id);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,1);assert.equal(f.db.prepare("SELECT stock_qty FROM products WHERE tenant_id='tenant-a'").get().stock_qty,8);assert.equal(f.db.prepare('SELECT count(*) n FROM audit_log').get().n,1);const get=await worker.fetch(new Request('https://sales.test/api/v1/orders/'+bodies[0].order.id,{headers:{authorization:'Bearer a','x-tenant-id':'tenant-a'}}),f.env);assert.equal(get.status,200);assert.equal((await get.json()).order.id,bodies[0].order.id);});
test('different operation keys cannot create two orders from one quote',async()=>{const f=fixture();const results=await Promise.all([worker.fetch(f.request('tenant-a','one'),f.env),worker.fetch(f.request('tenant-a','two'),f.env)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,1);});
test('tenant credential cannot select another tenant, missing operation fails closed',async()=>{const f=fixture();const forged=f.request('tenant-b');forged.headers.set('authorization','Bearer a');assert.notEqual((await worker.fetch(forged,f.env)).status,201);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,0);assert.equal((await worker.fetch(f.request('tenant-a',null),f.env)).status,400);});
test('insufficient stock rolls back order, operation claim and quote acceptance',async()=>{const f=fixture();f.db.exec("UPDATE products SET stock_qty=1 WHERE tenant_id='tenant-a'");const r=await worker.fetch(f.request(),f.env);assert.equal(r.status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM order_create_operations').get().n,0);assert.equal(f.db.prepare("SELECT status FROM quotes WHERE tenant_id='tenant-a'").get().status,'OPEN');});
test('replay after lost response returns same order and operation cannot change quote',async()=>{const f=fixture();const first=await(await worker.fetch(f.request(),f.env)).json();const retry=await worker.fetch(f.request(),f.env);assert.equal(retry.status,200);assert.equal((await retry.json()).order.id,first.order.id);assert.equal((await worker.fetch(f.request('tenant-a','op1','Q2'),f.env)).status,409);});
test('same operation key is isolated across tenants',async()=>{const f=fixture();assert.equal((await worker.fetch(f.request(),f.env)).status,201);assert.equal((await worker.fetch(f.request('tenant-b'),f.env)).status,201);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,2);});
test('lost database response after commit reconciles without a second order',async()=>{const f=fixture();const batch=f.env.DB.batch;f.env.DB.batch=async statements=>{await batch(statements);throw new Error('lost response');};const r=await worker.fetch(f.request(),f.env);assert.equal(r.status,200);assert.equal((await r.json()).replayed,true);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,1);});
test('unscoped legacy token and demo reset are denied',async()=>{const f=fixture();const env={...f.env,SALES_OPS_CREDENTIALS_JSON:'[]',EMP001_API_TOKEN:'a'};assert.equal((await worker.fetch(f.request(),env)).status,401);assert.equal((await worker.fetch(new Request('https://sales.test/api/v1/demo/reset',{method:'POST',headers:{authorization:'Bearer a','x-tenant-id':'tenant-a'}}),f.env)).status,404);});
test('concurrent order state confirmations accept one transition and one audit', async () => {
 const f=fixture();
 try {
  const created=await (await worker.fetch(f.request(),f.env)).json();
  const batch=f.env.DB.batch;
  f.env.DB.batch=async statements=>(await batch(statements)).map(result=>({success:true,meta:{changes:Number(result.changes)}}));
  const request=()=>new Request(`https://sales.test/api/v1/orders/${created.order.id}/state`,{method:'POST',headers:{authorization:'Bearer a','x-tenant-id':'tenant-a','content-type':'application/json'},body:JSON.stringify({status:'PAYMENT_CONFIRMED',evidence:{reference:'verified-test-payment'}})});
  const results=await Promise.all([worker.fetch(request(),f.env),worker.fetch(request(),f.env)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action='ORDER_STATE_PAYMENT_CONFIRMED'").get().n,1);
  assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(created.order.id).status,'PAYMENT_CONFIRMED');
 } finally { f.db.close(); }
});
test('failed transition audit rolls back the state change', async () => {
 const f=fixture();
 try {
  const created=await (await worker.fetch(f.request(),f.env)).json();
  const batch=f.env.DB.batch;
  f.env.DB.batch=async statements=>{
   statements[1]={...statements[1],query:'INSERT INTO missing_audit_table VALUES(?)',args:['fail']};
   return batch(statements);
  };
  const r=await worker.fetch(new Request(`https://sales.test/api/v1/orders/${created.order.id}/state`,{method:'POST',headers:{authorization:'Bearer a','x-tenant-id':'tenant-a','content-type':'application/json'},body:JSON.stringify({status:'PAYMENT_CONFIRMED',evidence:{reference:'verified-test-payment'}})}),f.env);
  assert.ok(r.status>=400);
  assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(created.order.id).status,'PAYMENT_PENDING');
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action='ORDER_STATE_PAYMENT_CONFIRMED'").get().n,0);
 } finally { f.db.close(); }
});

// Security regression: neither diagnostics nor preflight bypass authentication.
test('unauthenticated health and OPTIONS deny without disclosing service details',async()=>{
 const f=fixture();
 for(const method of ['GET','OPTIONS']) {
  const url=method==='GET'?'https://sales.test/health':'https://sales.test/api/v1/orders';
  const response=await worker.fetch(new Request(url,{method}),f.env);
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,'UNAUTHORIZED');
 }
});
test('authenticated health and OPTIONS retain previous responses',async()=>{
 const f=fixture();
 const headers={authorization:'Bearer a','x-tenant-id':'tenant-a'};
 const health=await worker.fetch(new Request('https://sales.test/health',{headers}),f.env);
 assert.equal(health.status,200);
 assert.equal((await health.json()).status,'ok');
 const preflight=await worker.fetch(new Request('https://sales.test/api/v1/orders',{method:'OPTIONS',headers}),f.env);
 assert.equal(preflight.status,204);
});
