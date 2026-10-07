import type { CrmTransport, CrmCapabilityInput } from "../adapters/crm";
import type { CapabilityResult } from "./adapters";

function asRecord(value:unknown):Record<string,unknown>|undefined{
 return value!==null && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
function extractEntity(output:unknown):Record<string,unknown>|undefined{
 const record=asRecord(output); if(!record) return undefined;
 const data=record.data;
 if(Array.isArray(data)) return asRecord(data[0]);
 return asRecord(data) ?? record;
}
function extractId(output: unknown): string | number | undefined {
 const entity=extractEntity(output); if(!entity) return undefined;
 const id=entity.id; return typeof id==="string" || typeof id==="number" ? id : undefined;
}
function valuesEqual(expected:unknown,actual:unknown):boolean{
 if(expected===actual) return true;
 if(expected===null || actual===null || typeof expected!=="object" || typeof actual!=="object") return false;
 if(Array.isArray(expected)) return Array.isArray(actual) && expected.length===actual.length && expected.every((v,i)=>valuesEqual(v,actual[i]));
 if(Array.isArray(actual)) return false;
 const actualRecord=actual as Record<string,unknown>;
 return Object.entries(expected as Record<string,unknown>).every(([key,value])=>valuesEqual(value,actualRecord[key]));
}
function readBackMatches(request:CrmCapabilityInput,id:string|number,output:unknown):boolean{
 const entity=extractEntity(output); if(!entity || entity.id!==id) return false;
 const expected=request.payload;
 if(!expected || typeof expected!=="object" || Array.isArray(expected)) return true;
 return Object.entries(expected).every(([key,value])=>key==="id" || valuesEqual(value,entity[key]));
}

export async function executeMarketingCrmWriteWithReadBack(input:{
 tenantId:string; correlationId:string; idempotencyKey:string;
 request:CrmCapabilityInput; writeTransport:CrmTransport; readTransport:CrmTransport;
}):Promise<CapabilityResult>{
 if(input.request.operation==="read") return {ok:false,error:{code:"MARKETING_WRITE_REQUIRED",message:"Read-back flow requires a mutation"}};
 if(!["marketingCampaigns","clientInteractions"].includes(input.request.entity)) return {ok:false,error:{code:"MARKETING_CRM_ENTITY_BLOCKED",message:"Entity is outside EMP-003 verified write scope"}};
 const written=await input.writeTransport.execute({tenantId:input.tenantId,correlationId:input.correlationId,idempotencyKey:input.idempotencyKey,...input.request});
 if(!written.ok) return written;
 const id=extractId(written.output) ?? input.request.payload?.id as string|number|undefined;
 if(id===undefined) return {ok:false,error:{code:"MARKETING_CRM_READBACK_ID_MISSING",message:"Successful write did not expose an entity id"},evidence:{...(written.evidence??{}),persistenceConfirmed:false}};
 const read=await input.readTransport.execute({tenantId:input.tenantId,correlationId:input.correlationId,operation:"read",entity:input.request.entity,payload:{id}});
 if(!read.ok) return {ok:false,error:{code:"MARKETING_CRM_READBACK_FAILED",message:"CRM write completed but read-back failed",retryable:read.error?.retryable},evidence:{...(written.evidence??{}),writeExecuted:true,persistenceConfirmed:false,readBackEvidence:read.evidence}};
 if(!readBackMatches(input.request,id,read.output)) return {ok:false,error:{code:"MARKETING_CRM_READBACK_MISMATCH",message:"CRM read-back does not match the requested persisted state"},evidence:{...(written.evidence??{}),writeExecuted:true,persistenceConfirmed:false,readBackEvidence:read.evidence}};
 return {ok:true,output:{write:written.output,readBack:read.output},evidence:{...(written.evidence??{}),writeExecuted:true,persistenceConfirmed:true,readBackEvidence:read.evidence}};
}
