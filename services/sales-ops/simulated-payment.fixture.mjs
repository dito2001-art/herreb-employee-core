import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY,active INT); CREATE TABLE customers(id TEXT,tenant_id TEXT,discount_pct INT); CREATE TABLE products(sku TEXT,tenant_id TEXT,name TEXT,active INT,stock_qty INT,price_gs INT,category TEXT); CREATE TABLE quotes(id TEXT,tenant_id TEXT,customer_id TEXT,status TEXT,quote_json TEXT,total_gs INT,created_at TEXT); CREATE TABLE orders(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT,quote_id TEXT,status TEXT,total_gs INT,created_at TEXT,updated_at TEXT,evidence_json TEXT); CREATE TABLE order_lines(id TEXT PRIMARY KEY,tenant_id TEXT,order_id TEXT,sku TEXT,name TEXT,qty INT,unit_price_gs INT,line_total_gs INT); CREATE TABLE audit_log(id TEXT PRIMARY KEY,tenant_id TEXT,ts TEXT,actor TEXT,action TEXT,entity_type TEXT,entity_id TEXT,payload_json TEXT); CREATE TABLE tenant_operations(tenant_id TEXT PRIMARY KEY,operations_json TEXT,updated_at TEXT);`);
  db.exec(readFileSync(new URL('./migrations/0001_order_create_operations.sql',import.meta.url),'utf8'));
  for(const t of ['herreb-client-b','tenant-a']) {
    db.prepare('INSERT INTO tenants VALUES(?,1)').run(t);
    db.prepare('INSERT INTO customers VALUES(?,?,0)').run('WF01-B-DEMO-001',t);
    db.prepare('INSERT INTO products VALUES(?,?,?,1,10,900000,?)').run('WF01-B-ESCRITORIO-001',t,'Escritorio de prueba','Muebles');
    db.prepare('INSERT INTO tenant_operations VALUES(?,?,?)').run(t,JSON.stringify({treasury:'forbidden',paymentMethods:'transferencia'}),'now');
  }
  const DB={prepare(query){return {bind(...args){return {query,args,async first(){return db.prepare(query).get(...args)||null;},async all(){return {results:db.prepare(query).all(...args)};},async run(){return db.prepare(query).run(...args);}}},async run(){return db.prepare(query).run();}}},async batch(ss){db.exec('BEGIN');try{const result=ss.map(s=>db.prepare(s.query).run(...s.args));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const env={DB,DEPLOYMENT_ENV:'staging-b',SIMULATED_PAYMENT_ENABLED:'true',SALES_OPS_CREDENTIALS_JSON:JSON.stringify([{token:'local-b',tenantId:'herreb-client-b'},{token:'local-a',tenantId:'tenant-a'}])};
  function req(path,body,tenant='herreb-client-b',token=tenant==='tenant-a'?'local-a':'local-b') {return new Request('https://sales.test/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'x-tenant-id':tenant,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  return {env,db,req};
}
