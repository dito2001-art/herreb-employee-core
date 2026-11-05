import {canMutateTenant} from './registry/registry';
import type {ConfigurationEnv} from './emp001-configuration';
import type {RegistryIdentity} from './registry/types';
export type Profile=Record<string,string|boolean>;
const textLimits:Record<string,number>={sellerName:80,personality:2000,tone:80,goal:120,instructions:5000,policies:5000,faq:5000,recommendationRules:3000,discountRules:2000,closingRules:3000,escalationRules:3000,ownerName:100,ownerContact:300,treasuryName:100,treasuryContact:300,logisticsName:100,logisticsContact:300,catalogueName:100,catalogueContact:300};
const booleans=new Set(['upsell','crossSell','discounts']);
const json=(b:unknown,s=200)=>Response.json(b,{status:s,headers:{'cache-control':'no-store'}});
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function sanitizeProfile(x:unknown):Profile{
 if(!object(x)||Object.keys(x).length>30)throw Error('INVALID_PROFILE');const out:Profile={};
 for(const [key,v]of Object.entries(x)){if(booleans.has(key)){if(typeof v!=='boolean')throw Error('INVALID_PROFILE');out[key]=v;}else if(Object.hasOwn(textLimits,key)){if(typeof v!=='string'||v.length>textLimits[key]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw Error('INVALID_PROFILE');out[key]=v;}else throw Error('PROFILE_FIELD_FORBIDDEN');}
 if(new TextEncoder().encode(JSON.stringify(out)).length>24000)throw Error('PROFILE_TOO_LARGE');return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));
}
export const profileIssues=(p:Profile)=>['sellerName','personality','instructions','ownerName','ownerContact'].filter(k=>typeof p[k]!=='string'||!String(p[k]).trim());
const hash=async(x:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(v=>v.toString(16).padStart(2,'0')).join('');
interface Revision{revision:number;baseRevision:number;hash:string;data:Profile;operationId:string;createdAt:string}
interface State{schema:1;revision:number;history:Revision[]}
const initial=():State=>({schema:1,revision:0,history:[]});
function parse(raw:string):{root:Record<string,unknown>;state:State}{const root=JSON.parse(raw);if(!object(root))throw Error('PROFILE_STATE_INVALID');if(root.emp001Profile===undefined)return{root,state:initial()};const s=root.emp001Profile as State;if(!s||s.schema!==1||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.history)||s.history.length!==s.revision||s.history.some((r,i)=>r.revision!==i+1||r.baseRevision!==i||typeof r.hash!=='string'||typeof r.operationId!=='string'))throw Error('PROFILE_STATE_INVALID');return{root,state:s}}
export async function handleEMP001Profile(request:Request,env:ConfigurationEnv,tenantId:string,identity:RegistryIdentity,action:'profile'|'validate'):Promise<Response>{
 try{
 if(Number(request.headers.get('content-length')||0)>30000)return json({ok:false,error:'PROFILE_TOO_LARGE'},413);
 const row=await env.REGISTRY_DB.prepare("SELECT configuration_json AS configurationJson FROM tenant_employees WHERE tenant_id=? AND employee_id='EMP-001' AND status='active'").bind(tenantId).first<{configurationJson:string}>();
 if(!row)return json({ok:false,error:'EMP001_NOT_ENABLED'},403);
 const {root,state}=parse(row.configurationJson),latest=state.history.at(-1);
 const view=()=>({ok:true,tenantId,revision:state.revision,hash:latest?.hash??null,draft:latest?.data??{},history:state.history.map(({data,operationId,...r})=>r),published:false,canPublish:false,canEdit:canMutateTenant(identity,tenantId)});
 if(request.method==='GET'&&action==='profile')return json(view());
 const raw=await request.text();if(new TextEncoder().encode(raw).length>30000)return json({ok:false,error:'PROFILE_TOO_LARGE'},413);
 let body:unknown;try{body=JSON.parse(raw)}catch{return json({ok:false,error:'INVALID_JSON'},400)}
 if(!object(body)||Object.keys(body).some(k=>!['data','expectedRevision','operationId','hash'].includes(k)))return json({ok:false,error:'INVALID_PROFILE_REQUEST'},400);
 const data=sanitizeProfile(body.data),digest=await hash(data);
 if(action==='validate'){
   if(body.expectedRevision!==state.revision||!latest||body.hash!==latest.hash||digest!==latest.hash)return json({ok:false,error:'PROFILE_REVISION_CONFLICT'},409);
   const issues=profileIssues(data);return json({ok:true,tenantId,revision:state.revision,hash:digest,valid:issues.length===0,issues,canPublish:false});
 }
 if(!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0||typeof body.operationId!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(body.operationId))return json({ok:false,error:'PROFILE_OPERATION_REQUIRED'},400);
 const replay=state.history.find(r=>r.operationId===body.operationId);
 if(replay)return replay.hash===digest&&replay.baseRevision===body.expectedRevision?json({...view(),replayed:true,savedRevision:replay.revision}):json({ok:false,error:'PROFILE_OPERATION_CONFLICT'},409);
 if(body.expectedRevision!==state.revision)return json({ok:false,error:'PROFILE_REVISION_CONFLICT'},409);
 if(state.history.length>=20)return json({ok:false,error:'PROFILE_HISTORY_CAPACITY'},409);
 const revision:Revision={revision:state.revision+1,baseRevision:state.revision,hash:digest,data,operationId:body.operationId,createdAt:new Date().toISOString()};
 const next:State={schema:1,revision:revision.revision,history:[...state.history,revision]},encoded=JSON.stringify({...root,emp001Profile:next}),correlation=crypto.randomUUID();
 if(!env.REGISTRY_DB.batch)return json({ok:false,error:'PROFILE_STORAGE_UNAVAILABLE'},503);
 const result=await env.REGISTRY_DB.batch([
   env.REGISTRY_DB.prepare("UPDATE tenant_employees SET configuration_json=?,updated_at=? WHERE tenant_id=? AND employee_id='EMP-001' AND status='active' AND configuration_json=?").bind(encoded,revision.createdAt,tenantId,row.configurationJson),
   env.REGISTRY_DB.prepare("INSERT INTO audit_log(id,tenant_id,actor_id,actor_email,actor_role,action,resource_type,resource_id,correlation_id,before_json,after_json) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),tenantId,identity.actorId,identity.email,identity.platformRole??identity.tenantMemberships.find(m=>m.tenantId===tenantId)?.role??'unknown','EMP001_PROFILE_DRAFT_SAVED','employee','EMP-001',correlation,JSON.stringify({revision:state.revision}),JSON.stringify({revision:next.revision,hash:digest}))
 ]);
 const changes=(result[0] as {meta?:{changes?:number};changes?:number})?.meta?.changes??(result[0] as {changes?:number})?.changes;
 if(changes!==1)return json({ok:false,error:'PROFILE_REVISION_CONFLICT'},409);
 // Independent read verifies the immutable revision even if another writer has advanced.
 const read=await env.REGISTRY_DB.prepare("SELECT configuration_json AS configurationJson FROM tenant_employees WHERE tenant_id=? AND employee_id='EMP-001' AND status='active'").bind(tenantId).first<{configurationJson:string}>();
 if(!read)return json({ok:false,error:'PROFILE_READBACK_FAILED'},502);
 const saved=parse(read.configurationJson).state,receipt=saved.history.find(r=>r.operationId===body.operationId);
 if(!receipt||receipt.hash!==digest||await hash(sanitizeProfile(receipt.data))!==digest)return json({ok:false,error:'PROFILE_READBACK_FAILED'},502);
 return json({ok:true,tenantId,revision:receipt.revision,hash:receipt.hash,draft:receipt.data,published:false,canPublish:false,readBack:true,replayed:false});
 }catch(e){const error=e instanceof Error?e.message:'';return json({ok:false,error:['INVALID_PROFILE','PROFILE_FIELD_FORBIDDEN','PROFILE_TOO_LARGE'].includes(error)?error:'PROFILE_SERVICE_UNAVAILABLE'},['INVALID_PROFILE','PROFILE_FIELD_FORBIDDEN','PROFILE_TOO_LARGE'].includes(error)?400:503)}
}
