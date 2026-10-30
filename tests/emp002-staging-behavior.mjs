import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'staging-test',alg:'RS256',use:'sig'};
const issuer='https://access.test.cloudflare.local',audience='emp002-staging-test';
const manifests=['tenant-a','tenant-b'].map(tenantId=>({tenantId,whatsappOwners:[],reminderOwnerWhatsapp:'595981000001'}));
const identities=[{email:'a@example.test',tenantId:'tenant-a',actorId:'actor-a',role:'owner'},{email:'b@example.test',tenantId:'tenant-b',actorId:'actor-b',role:'owner'},{email:'reader@example.test',tenantId:'tenant-a',actorId:'reader-a',role:'user'}];
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(email,opts={}){
 const h=encode({alg:'RS256',kid:'staging-test',typ:'JWT'});
 const p=encode({iss:issuer,aud:audience,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,email,...opts});
 const sig=createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey).toString('base64url');
 return h+'.'+p+'.'+sig;
}
const built=await build({entryPoints:['staging/emp002-entry.ts'],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',conditions:['workerd','worker','browser'],external:['node:*']});
let outboundAttempts=0;
const mf=new Miniflare({
 modules:[{type:'ESModule',path:'emp002-staging.mjs',contents:built.outputFiles[0].text}],
 compatibilityDate:'2026-06-11',compatibilityFlags:['nodejs_compat'],
 durableObjects:{EMP002_OPERATIONS:{className:'EMP002Operations',useSQLite:true}},durableObjectsPersist:false,
 outboundService(){outboundAttempts++;return new Response('LOCAL_EGRESS_FORBIDDEN',{status:503});},
 bindings:{
  EMP002_STAGING_ACCESS_ISSUER:issuer,EMP002_STAGING_ACCESS_AUDIENCE:audience,
  EMP002_STAGING_TRUSTED_JWKS_JSON:JSON.stringify({keys:[jwk]}),
  ACCESS_IDENTITY_MAP_JSON:JSON.stringify(identities),TENANT_MANIFESTS_JSON:JSON.stringify(manifests),
  EMP002_RECONCILIATION_TOKEN:'local-only-token',
  META_ACCESS_TOKEN:'FORBIDDEN_TEST_META_CREDENTIAL',META_PHONE_NUMBER_ID:'FORBIDDEN_TEST_PHONE_ID'
 }
});
const results=[];
async function call(path,jwt,body={},extraHeaders={}){
 const headers={'content-type':'application/json',...extraHeaders};
 if(jwt) headers['cf-access-jwt-assertion']=jwt;
 return mf.dispatchFetch('http://localhost'+path,{method:'POST',headers,body:JSON.stringify(body)});
}
try{
 assert.equal((await call('/staging/emp002/calendar',null)).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('a@example.test')+'tamper')).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('a@example.test',{aud:'wrong'}))).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('a@example.test',{iss:'https://foreign.test'}))).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('a@example.test',{exp:1}))).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('unknown@example.test'))).status,403);
 results.push('JWT missing/tampered/wrong audience: PASS');
 assert.equal((await call('/api/internal/emp003/review',token('a@example.test'))).status,404);
 assert.equal((await call('/internal/native-reminders/execute',token('a@example.test'))).status,404);
 assert.equal((await call('/webhooks/meta/whatsapp',token('a@example.test'))).status,404);
 results.push('privileged routes denied: PASS');
 const calendar='/staging/emp002/calendar';
 const entry=(id,title,tenantId)=>({id,title,tenantId,kind:'TASK',startsAt:'2026-11-01T12:00:00Z',status:'ACTIVE',updatedAt:'2026-10-30T12:00:00Z'});
 const write=(e,expectedVersion=0)=>({operation:'save',entry:e,expectedVersion});
 const ownA=entry('a-secret','A PRIVATE','tenant-a'),ownB=entry('b-secret','B PRIVATE','tenant-b');
 assert.equal((await call(calendar,token('a@example.test'),write(ownA))).status,200);
 assert.equal((await call(calendar,token('b@example.test'),write(ownB))).status,200);
 for(const [email,own,foreign] of [['a@example.test',ownA,ownB],['b@example.test',ownB,ownA]]){
  const ownRead=await call(calendar,token(email),{operation:'get',id:own.id});
  assert.equal((await ownRead.json()).entry.title,own.title);
  const foreignRead=await call(calendar,token(email),{operation:'get',id:foreign.id});
  assert.equal((await foreignRead.json()).entry,null);
  assert.equal((await call(calendar,token(email),write({...foreign,title:'FORBIDDEN'},1))).status,403);
 }
 results.push('seeded Access A/B own reads, foreign reads/writes and unchanged records: PASS');
 const ns=await mf.getDurableObjectNamespace('EMP002_OPERATIONS');
 const stub=ns.get(ns.idFromName('tenant:tenant-a'));
 const unauthorized = await Promise.all([
  call(calendar,token('reader@example.test'),write(entry('reader-write','FORBIDDEN','tenant-a'))),
  call(calendar,token('a@example.test'),write(entry('csrf','FORBIDDEN','tenant-a')),{'origin':'https://foreign.test'}),
  stub.fetch('https://emp002.internal/native-calendar',{method:'POST',headers:{'content-type':'application/json','x-herreb-internal-tenant-id':'tenant-b'},body:JSON.stringify(write(entry('direct-foreign','FORBIDDEN','tenant-b')))}),
  call(calendar,token('a@example.test'),{operation:'get',id:ownA.id},{'content-type':'text/plain'}),
  call(calendar,token('a@example.test'),{operation:'get',id:ownA.id,padding:'é'.repeat(40000)})
 ]);
 console.log('new boundary status observations: '+JSON.stringify(unauthorized.map(r=>r.status)));
 assert.deepEqual(unauthorized.map(r=>r.status),[403,403,403,415,413]);
 const reader=await call(calendar,token('reader@example.test'),{operation:'get',id:ownA.id});
 assert.equal((await reader.json()).entry.title,ownA.title);
 for(const [email,own] of [['a@example.test',ownA],['b@example.test',ownB]]){
  const back=await call(calendar,token(email),{operation:'get',id:own.id});
  assert.equal((await back.json()).entry.title,own.title);
 }
 results.push('read-only role, origin, direct DO tenant pin, JSON and UTF-8 body boundary: PASS');
 assert.equal(reader.headers.get('cache-control'),'private, no-store');
 assert.equal((await call(calendar,token('a@example.test'),{}, {'x-herreb-internal-tenant-id':'tenant-b'})).status,403);
 assert.equal((await call(calendar,token('a@example.test'),{}, {'x-emp002-reconciliation-token':'forged'})).status,403);
 const direct=await stub.fetch('https://emp002.internal/internal/native-reminders/execute',{method:'POST',headers:{'x-herreb-internal-tenant-id':'tenant-a','x-emp002-reconciliation-token':'local-only-token'}});
 assert.equal(direct.status,403);
 const inbound=await stub.fetch('https://emp002.internal/inbound/whatsapp',{method:'POST'});
 assert.equal(inbound.status,403);
 for(const path of ['/internal/native-reminders/claim','/internal/native-reminders/reconcile','/appointment/actions/execute','/internal/native-outbound/reconcile']) {
  const denied=await stub.fetch('https://emp002.internal'+path,{method:'POST',headers:{'x-herreb-internal-tenant-id':'tenant-a','x-emp002-reconciliation-token':'local-only-token'}});
  assert.equal(denied.status,403,path);
 }
 results.push('direct DO outbound handlers denied: PASS');
 const status=await call('/staging/emp002/reminder-status',token('a@example.test'),{id:'none',version:1});
 assert.ok([200,404].includes(status.status), 'status-only endpoint should not trigger transport: '+status.status);
 results.push('status-only read does not require Meta: PASS');
 assert.equal(outboundAttempts,0);
 results.push('outbound trap: zero Meta or other network attempts: PASS');
 results.forEach(x=>console.log(x));
}finally{await mf.dispose();}
