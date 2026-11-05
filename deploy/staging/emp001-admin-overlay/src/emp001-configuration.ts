import {handleEMP001Profile} from './emp001-profile';
import { verifyWorkforceAccessJwt } from './access-jwt';
import { resolveIdentity, canAccessTenant, canMutateTenant, resolveTenantManifest } from './registry/registry';
import type { RegistryEnv } from './registry/http';

type Service = {fetch(request: Request): Promise<Response>};
export interface ConfigurationEnv extends RegistryEnv {
  REGISTRY_DB: RegistryEnv['REGISTRY_DB'] & {batch?: (statements: unknown[])=>Promise<unknown[]>};
  DEPLOYMENT_ENV?: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  // Deployment-owned mappings; browsers never choose services or credentials.
  EMP001_TENANT_SERVICES_JSON?: string;
  [name: string]: unknown;
}
const fields = new Set(['pickupLocation','pickupHours','deliveryCoverage','deliveryCostGs','deliveryInstructions']);
const json = (data: unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
function publicOperations(value: unknown): Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key])=>fields.has(key)));
}
export async function handleEMP001Configuration(request: Request, env: ConfigurationEnv, fetchKeys: typeof fetch = fetch): Promise<Response|null> {
 const url=new URL(request.url);
 const match=url.pathname.match(/^\/api\/tenants\/([a-z0-9-]{2,64})\/emp001\/configuration(?:\/(profile|validate))?$/);
 if(!match) return url.pathname.includes('/emp001/configuration')?json({ok:false,error:'ROUTE_NOT_FOUND'},404):null;
 if(env.DEPLOYMENT_ENV!=='staging-b') return json({ok:false,error:'STAGING_CONFIGURATION_DISABLED'},404);
 const action=match[2] as 'profile'|'validate'|undefined;
 const allowed=action==='validate'?['POST']:['GET','PUT'];
 if(!allowed.includes(request.method)) return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 if(request.method!=='GET' && (request.headers.get('origin')!==url.origin || !request.headers.get('content-type')?.startsWith('application/json'))) return json({ok:false,error:'ORIGIN_OR_CONTENT_TYPE_REJECTED'},403);
 let email:string;
 let accessPhase="config";
 try {
   const issuer=env.ACCESS_ISSUER||'', audience=env.ACCESS_AUDIENCE||'', jwt=request.headers.get('cf-access-jwt-assertion')||'';
   const team=new URL(issuer);
   if(team.protocol!=='https:' || !team.hostname.endsWith('.cloudflareaccess.com') || team.pathname!=='/' || team.search || team.username || team.password || team.port) throw Error('config');
   if(!jwt || !audience) throw Error('auth');
   accessPhase="jwks_fetch";
   const keys=await fetchKeys(issuer.replace(/\/$/,'')+'/cdn-cgi/access/certs',{redirect:'manual',signal:AbortSignal.timeout(5000)});
   accessPhase='jwks_http_'+keys.status;
   if(!keys.ok) throw Error('jwks');
   const jwks=await keys.json() as {keys:JsonWebKey[]};
   accessPhase='jwt_verify';
   email=(await verifyWorkforceAccessJwt({jwt,issuer,audience,jwks,nowSeconds:Date.now()/1000})).email;
 } catch (cause) {console.warn('EMP001_CONFIG_ACCESS_DENIED',{phase:accessPhase,errorType:cause instanceof Error?cause.name:'Unknown',jwtPresent:Boolean(request.headers.get('cf-access-jwt-assertion')),reason:cause instanceof Error && /^WORKFORCE_ACCESS_[A-Z_]+$/.test(cause.message)?cause.message:'ACCESS_CONFIG_OR_JWKS_FAILURE'});return json({ok:false,error:'VERIFIED_ACCESS_REQUIRED'},401);}
 const identity=await resolveIdentity(env.REGISTRY_DB,email);
 const tenantId=match[1];
 if(!identity || !canAccessTenant(identity,tenantId) || (request.method!=='GET'&&!canMutateTenant(identity,tenantId))) return json({ok:false,error:'TENANT_PERMISSION_DENIED'},403);
 const manifest=await resolveTenantManifest(env.REGISTRY_DB,tenantId);
 if(!manifest || manifest.status!=='active' || !manifest.enabledEmployees.includes('EMP-001')) return json({ok:false,error:'EMP001_NOT_ENABLED'},403);
 if(action)return handleEMP001Profile(request,env,tenantId,identity,action);
 let profiles:Record<string,{binding:string;tokenRef:string}>;
 try{profiles=JSON.parse(env.EMP001_TENANT_SERVICES_JSON||'{}');}catch{return json({ok:false,error:'SERVICE_CONFIG_INVALID'},503);}
 const profile=Object.hasOwn(profiles,tenantId)?profiles[tenantId]:undefined;
 const service=profile && env[profile.binding] as Service|undefined;
 const configuredToken=profile && env[profile.tokenRef];
 const token=typeof configuredToken==='string'?configuredToken.trim():configuredToken;
 if(!service || typeof service.fetch!=='function' || typeof token!=='string' || !token) return json({ok:false,error:'TENANT_SERVICE_NOT_CONNECTED'},503);
 const headers={'authorization':`Bearer ${token}`,'x-tenant-id':tenantId,'content-type':'application/json'};
 const read=()=>service.fetch(new Request('https://sales-ops.internal/api/v1/tenant-operations',{headers}));
 let expected:Record<string,unknown>|undefined;
 try{
   if(request.method==='PUT'){
     const input=await request.json() as {operations?:unknown};
     if(!input || Object.keys(input).some(k=>k!=='operations') || !input.operations || typeof input.operations!=='object' || Array.isArray(input.operations)) return json({ok:false,error:'INVALID_CONFIGURATION'},400);
     const entries=Object.entries(input.operations);
     if(entries.some(([k,v])=>!fields.has(k) || (k==='deliveryCostGs'? typeof v!=='number'||!Number.isSafeInteger(v)||v<0 : typeof v!=='string'||v.length>1000))) return json({ok:false,error:'CONFIGURATION_FIELD_FORBIDDEN'},400);
     expected=input.operations as Record<string,unknown>;
     const before=await read(); if(!before.ok) return json({ok:false,error:'SALES_OPS_READ_FAILED'},502);
     const current=await before.json() as {tenant_id?:string;operations?:Record<string,unknown>};
     if(current.tenant_id!==tenantId) return json({ok:false,error:'UPSTREAM_TENANT_MISMATCH'},502);
     const write=await service.fetch(new Request('https://sales-ops.internal/api/v1/tenant-operations',{method:'PUT',headers,body:JSON.stringify({operations:{...publicOperations(current.operations),...input.operations}})}));
     if(!write.ok) return json({ok:false,error:'CONFIGURATION_SAVE_FAILED'},502);
   }
   const response=await read(); if(!response.ok) return json({ok:false,error:'SALES_OPS_READ_FAILED'},502);
   const saved=await response.json() as {tenant_id?:string;operations?:Record<string,unknown>;updated_at?:string};
   if(saved.tenant_id!==tenantId) return json({ok:false,error:'UPSTREAM_TENANT_MISMATCH'},502);
   if(expected && Object.entries(expected).some(([k,v])=>saved.operations?.[k]!==v)) return json({ok:false,error:'CONFIGURATION_READBACK_MISMATCH'},502);
   return json({ok:true,tenantId,operations:publicOperations(saved.operations),paymentMode:saved.operations?.paymentMode,updatedAt:saved.updated_at,canEdit:canMutateTenant(identity,tenantId),readBack:true});
 }catch{return json({ok:false,error:'CONFIGURATION_SERVICE_UNAVAILABLE'},502);}
}
