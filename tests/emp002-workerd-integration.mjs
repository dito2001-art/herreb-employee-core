import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const compiled=await build({entryPoints:['tests/emp002-workerd-worker.ts'],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',conditions:['workerd','worker','browser'],external:['node:*']});
const manifests=['tenant-a','tenant-b'].map((tenant,i)=>({tenantId:tenant,whatsappOwners:[`59598100000${i+1}`],reminderOwnerWhatsapp:`59598100000${i+1}`}));
const mf=new Miniflare({
 modules:[{type:'ESModule',path:'emp002-test.mjs',contents:compiled.outputFiles[0].text}],
 compatibilityDate:'2026-06-11',compatibilityFlags:['nodejs_compat'],
 durableObjects:{EMP002_OPERATIONS:'EMP002Operations'},
 durableObjectsPersist:false,
 bindings:{EMP002_RECONCILIATION_TOKEN:'local-only-token',TENANT_MANIFESTS_JSON:JSON.stringify(manifests),META_ACCESS_TOKEN:'LOCAL_FAKE_NO_REAL_NETWORK',META_PHONE_NUMBER_ID:'LOCAL_FAKE',META_GRAPH_VERSION:'v26.0'},
});
async function call(tenant,path,body={},options={}) {
 const r=await mf.dispatchFetch('http://localhost/__test/do',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenant,path,body,...options})});
 return {status:r.status,body:await r.json()};
}
async function control(body) {
 const r=await mf.dispatchFetch('http://localhost/__test/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return r.json();
}
const now=new Date();
const past=new Date(now.getTime()-60000).toISOString();
const later=new Date(now.getTime()+3600000).toISOString();
const makeEntry=(tenant,id,status='ACTIVE')=>({tenantId:tenant,id,kind:'TASK',title:'Local only',startsAt:later,reminderAt:past,status,updatedAt:now.toISOString()});
async function save(tenant,id,expectedVersion=0,status='ACTIVE'){
 const result=await call(tenant,'/native-calendar',{operation:'save',expectedVersion,entry:makeEntry(tenant,id,status)});
 assert.equal(result.status,200,JSON.stringify(result));
 return result.body.entry;
}
async function status(tenant,id,version=1,options={}){
 return call(tenant,'/internal/native-reminders/status',{id,version},options);
}
const execute=tenant=>call(tenant,'/internal/native-reminders/execute');
const results=[];
try {
 await control({reset:true});
 await save('tenant-a','cancel-before');
 await save('tenant-a','cancel-before',1,'CANCELLED');
 await execute('tenant-a');
 assert.equal((await control({})).sends,0);
 results.push('cancel-before: PASS');

 await save('tenant-a','concurrent');
 await control({reset:true,mode:'pause'});
 const first=execute('tenant-a');
 for(let i=0;i<100;i++){
  if((await control({})).sends===1) break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal((await control({})).sends,1,'first mock Meta call did not start');
 const second=await execute('tenant-a');
 assert.equal((await control({})).sends,1,'duplicate Meta send');
 assert.equal((await status('tenant-a','concurrent')).body.status,'UNKNOWN');
 await control({release:true});
 await first;
 assert.equal((await status('tenant-a','concurrent')).body.status,'SENT');
 results.push('concurrent and SENT read-back: PASS');

 await save('tenant-a','timeout');
 await control({reset:true,mode:'timeout'});
 await execute('tenant-a');
 assert.equal((await status('tenant-a','timeout')).body.status,'UNKNOWN');
 await execute('tenant-a');
 assert.equal((await control({})).sends,1);
 results.push('timeout UNKNOWN no resend: PASS');

 await save('tenant-a','cancel-after');
 await control({reset:true,mode:'pause'});
 const inFlight=execute('tenant-a');
 for(let i=0;i<100;i++){
  if((await control({})).sends===1) break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal((await control({})).sends,1);
 await save('tenant-a','cancel-after',1,'CANCELLED');
 await control({release:true});
 await inFlight;
 assert.equal((await status('tenant-a','cancel-after')).body.status,'SENT');
 await execute('tenant-a');
 assert.equal((await control({})).sends,1);
 results.push('cancel-after UNKNOWN: PASS');

 assert.equal((await status('tenant-b','concurrent',1,{headerTenant:'tenant-a'})).status,403);
 assert.equal((await status('tenant-a','concurrent',1,{token:'omit'})).status,403);
 assert.equal((await status('tenant-b','concurrent')).status,404);
 await save('tenant-b','b-only');
 assert.equal((await status('tenant-a','b-only')).status,404);
 results.push('A/B isolation and auth: PASS');
 for(const item of results) console.log(item);
} finally {await mf.dispose();}
