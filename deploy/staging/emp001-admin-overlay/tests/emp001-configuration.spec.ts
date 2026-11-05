import {handleEMP001Configuration} from '../src/emp001-configuration';
function assert(v:unknown,m:string):asserts v{if(!v)throw Error(m);}
const issuer='https://fixture.cloudflareaccess.com',audience='isolated-config-audience';
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'fixture-key',use:'sig',alg:'RS256'};
const b64=(v:unknown)=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
async function jwt(email='owner-b@example.invalid',aud=audience){const now=Math.floor(Date.now()/1000);const data=b64({alg:'RS256',kid:'fixture-key'})+'.'+b64({email,iss:issuer,aud:[aud],iat:now,exp:now+120});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data));return data+'.'+btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function fixture(){let operations:Record<string,unknown>={pickupLocation:'Retiro inicial'};let writes=0;let corrupt=false;const db:any={prepare(sql:string){let values:unknown[]=[];return {bind(...v:unknown[]){values=v;return this;},async first(){if(sql.includes('configuration_json AS configurationJson FROM tenant_employees'))return{configurationJson:'{}'};if(sql.includes('platform_memberships'))return null;if(sql.includes('FROM tenants WHERE'))return{tenantId:values[0],name:'Fixture',status:'active'};return null;},async all(){if(sql.includes('FROM tenant_memberships'))return{results:[{tenantId:'herreb-client-b',actorId:'owner-b',role:String(values[0]).startsWith('viewer')?'tenant_viewer':'tenant_owner'}]};if(sql.includes('FROM tenant_employees'))return{results:[{employeeId:'EMP-001',configurationJson:'{}'}]};return {results:[]};}}}};
const env:any={DEPLOYMENT_ENV:'staging-b',REGISTRY_DB:db,ACCESS_ISSUER:issuer,ACCESS_AUDIENCE:audience,EMP001_TENANT_SERVICES_JSON:JSON.stringify({'herreb-client-b':{binding:'SALES_OPS_B',tokenRef:'SALES_OPS_B_TOKEN'}}),SALES_OPS_B_TOKEN:'fixture-only',SALES_OPS_B:{async fetch(r:Request){assert(r.headers.get('authorization')==='Bearer fixture-only','server credential');assert(r.headers.get('x-tenant-id')==='herreb-client-b','bound tenant');if(r.method==='PUT'){writes++;if(!corrupt)operations=(await r.json() as any).operations;}return Response.json({ok:true,tenant_id:'herreb-client-b',operations:{...operations,paymentMode:'SIMULATED'},updated_at:'fixture-revision'});}}};return{env,get writes(){return writes},corrupt(){corrupt=true}};}
const keysFetch=(async(_url,init)=>{assert(init?.redirect==='manual','Workers-compatible explicit no-follow JWKS fetch');return Response.json({keys:[jwk]});}) as typeof fetch;
async function req(t='herreb-client-b',method='GET',body?:unknown,email?:string,origin='https://config.invalid',aud=audience){return new Request(`https://config.invalid/api/tenants/${t}/emp001/configuration`,{method,headers:{'cf-access-jwt-assertion':await jwt(email,aud),'cf-access-authenticated-user-email':'forged@example.invalid',origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
let checks=0;async function status(f:ReturnType<typeof fixture>,r:Request,n:number){const result=await handleEMP001Configuration(r,f.env,keysFetch);assert(result?.status===n,`expected ${n}, received ${result?.status}: ${await result?.clone().text()}`);checks++;return result!;}
const f=fixture();f.env.SALES_OPS_B_TOKEN='  fixture-only  ';let r=await status(f,await req(),200);assert((await r.json() as any).tenantId==='herreb-client-b','read tenant');
r=await status(f,await req('herreb-client-b','PUT',{operations:{pickupLocation:'Retiro B verificado',deliveryCostGs:0}}),200);assert((await r.json() as any).operations.pickupLocation==='Retiro B verificado','persisted readback');assert(f.writes===1,'one write');
await status(f,await req('herreb-client-0'),403);
await status(f,await req('herreb-client-b','PUT',{operations:{pickupLocation:'X'}},'viewer@example.invalid'),403);
await status(f,await req('herreb-client-b','PUT',{operations:{pickupLocation:'X'}},undefined,'https://evil.invalid'),403);
await status(f,await req('herreb-client-b','PUT',{operations:{treasury:'forbidden'}}),400);
await status(f,await req('herreb-client-b','PUT',{operations:{paymentMode:'REAL'}}),400);
await status(f,await req('herreb-client-b','GET',undefined,undefined,undefined,'wrong-audience'),401);
await status(f,new Request('https://config.invalid/api/tenants/herreb-client-b/emp001/configuration',{headers:{'cf-access-authenticated-user-email':'owner-b@example.invalid'}}),401);
f.corrupt();await status(f,await req('herreb-client-b','PUT',{operations:{pickupLocation:'Not saved'}}),502);
const redirected=await handleEMP001Configuration(await req(),f.env,(async()=>new Response(null,{status:302,headers:{location:'https://evil.invalid'}})) as typeof fetch);assert(redirected?.status===401,'JWKS redirects must fail closed');checks++;
const profileRequest=async(t='herreb-client-b',method='GET',email?:string,origin='https://config.invalid')=>{const base=await req(t,method,method==='GET'?undefined:{data:{}},email,origin);return new Request(base.url+'/profile',base)};
let profile=await status(f,await profileRequest(),200);assert((await profile.json() as any).canEdit===true,'owner may edit profile');
await status(f,await profileRequest('herreb-client-0'),403);
await status(f,await profileRequest('herreb-client-b','PUT','viewer@example.invalid'),403);
await status(f,await profileRequest('herreb-client-b','PUT',undefined,'https://evil.invalid'),403);
await status(f,new Request('https://config.invalid/api/tenants/herreb-client-b/emp001/configuration/profile'),401);
await status(f,new Request('https://config.invalid/api/tenants/herreb-client-b/emp001/configuration/profile',{method:'POST'}),405);
await status(f,new Request('https://config.invalid/api/tenants/herreb-client-b/emp001/configuration/publish',{method:'POST'}),404);
f.env.DEPLOYMENT_ENV='production';await status(f,await req(),404);
console.log(`${checks} configuration HTTP checks PASS: RS256, identity, tenant, RBAC, Origin, protected fields, persistence and failure read-back`);
