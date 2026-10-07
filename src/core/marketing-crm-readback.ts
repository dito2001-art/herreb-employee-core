import type { CrmTransport, CrmCapabilityInput } from "../adapters/crm";
import type { CapabilityResult } from "./adapters";

function extractId(output: unknown): string | number | undefined {
 if(!output || typeof output!=="object") return undefined;
 const record=output as Record<string,unknown>;
 const direct=record.id;
 if(typeof direct==="string" || typeof direct==="number") return direct;
 const data=record.data;
 if(data && typeof data==="object"){
  const id=(data as Record<string,unknown>).id;
  if(typeof id==="string" || typeof id==="number") return id;
 }
 return undefined;
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
 return {ok:true,output:{write:written.output,readBack:read.output},evidence:{...(written.evidence??{}),writeExecuted:true,persistenceConfirmed:true,readBackEvidence:read.evidence}};
}
