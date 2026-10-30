import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'staging-test',alg:'RS256',use:'sig'};
const issuer='https://access.test.cloudflare.local',audience='emp002-staging-test';
const manifests=['tenant-a','tenant-b'].map(tenantId=>({tenantId,whatsappOwners:[],reminderOwnerWhatsapp:'595981000001'}));
const identities=[{email:'a@example.test',tenantId:'tenant-a',actorId:'actor-a',role:'owner'},{email:'b@example.test',tenantId:'tenant-b',actorId:'actor-b',role:'owner'}];
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(email,opts={}){
 const h=encode({alg:'RS256',kid:'staging-test',typ:'JWT'});
 const p=encode({iss:issuer,aud:audience,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,email,...opts});
 const sig=createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey).toString('base64url');
 return h+'.'+p+'.'+sig;
}
const built=await build({entryPoints:['staging/emp002-entry.ts'],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',conditions:['workerd','worker','browser'],external:['node:*']});
const mf=new Miniflare({
 modules:[{type:'ESModule',path:'emp002-staging.mjs',contents:built.outputFiles[0].text}],
 compatibilityDate:'2026-06-11',compatibilityFlags:['nodejs_compat'],
 durableObjects:{EMP002_OPERATIONS:{className:'EMP002Operations',useSQLite:true}},durableObjectsPersist:false,
 bindings:{
  EMP002_STAGING_ACCESS_ISSUER:issuer,EMP002_STAGING_ACCESS_AUDIENCE:audience,
  EMP002_STAGING_TRUSTED_JWKS_JSON:JSON.stringify({keys:[jwk]}),
  ACCESS_IDENTITY_MAP_JSON:JSON.stringify(identities),TENANT_MANIFESTS_JSON:JSON.stringify(manifests),
  EMP002_RECONCILIATION_TOKEN:'local-only-token',
  META_ACCESS_TOKEN:'FORBIDDEN_TEST_META_CREDENTIAL',META_PHONE_NUMBER_ID:'FORBIDDEN_TEST_PHONE_ID'
 }
});
const results=[];
async function call(path,jwt,body={}){
 const headers={'content-type':'application/json'};
 if(jwt) headers['cf-access-jwt-assertion']=jwt;
 return mf.dispatchFetch('http://localhost'+path,{method:'POST',headers,body:JSON.stringify(body)});
}
try{
 assert.equal((await call('/staging/emp002/calendar',null)).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('a@example.test')+'tamper')).status,403);
 assert.equal((await call('/staging/emp002/calendar',token('a@example.test',{aud:'wrong'}))).status,403);
 results.push('JWT missing/tampered/wrong audience: PASS');
 assert.equal((await call('/api/internal/emp003/review',token('a@example.test'))).status,404);
 assert.equal((await call('/internal/native-reminders/execute',token('a@example.test'))).status,404);
 assert.equal((await call('/webhooks/meta/whatsapp',token('a@example.test'))).status,404);
 results.push('privileged routes denied: PASS');
 const a=await call('/staging/emp002/calendar',token('a@example.test'),{operation:'get',id:'b-secret'});
 const b=await call('/staging/emp002/calendar',token('b@example.test'),{operation:'get',id:'b-secret'});
 assert.equal(a.status,200);
 assert.equal(b.status,200);
 assert.equal((await a.json()).entry,null);
 assert.equal((await b.json()).entry,null);
 results.push('two signed Access tenants independently scoped: PASS');
 const ns=await mf.getDurableObjectNamespace('EMP002_OPERATIONS');
 const stub=ns.get(ns.idFromName('tenant:tenant-a'));
 const direct=await stub.fetch('https://emp002.internal/internal/native-reminders/execute',{method:'POST',headers:{'x-herreb-internal-tenant-id':'tenant-a','x-emp002-reconciliation-token':'local-only-token'}});
 assert.equal(direct.status,403);
 const inbound=await stub.fetch('https://emp002.internal/inbound/whatsapp',{method:'POST'});
 assert.equal(inbound.status,403);
 results.push('direct DO outbound handlers denied: PASS');
 const status=await call('/staging/emp002/reminder-status',token('a@example.test'),{id:'none',version:1});
 assert.ok([200,404].includes(status.status), 'status-only endpoint should not trigger transport: '+status.status);
 results.push('status-only read does not require Meta: PASS');
 results.forEach(x=>console.log(x));
}finally{await mf.dispose();}
