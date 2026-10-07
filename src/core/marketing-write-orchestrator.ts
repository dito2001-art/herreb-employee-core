import { createMarketingCrmAdapter, type CrmCapabilityInput, type CrmTransport } from "../adapters/crm";
import { createAdapterRegistry } from "./adapters";
import type { TenantContext } from "./contracts";
import { executeCapability, type ControlledWriteAuthorization, type ExecutionResult } from "./executor";
import { executeMarketingCrmWriteWithReadBack } from "./marketing-crm-readback";

export async function executeEmp003MarketingWrite(input:{
 context:TenantContext;
 request:CrmCapabilityInput;
 idempotencyKey:string;
 controlledWriteAuthorization?:ControlledWriteAuthorization;
 writeTransport:CrmTransport;
 readTransport:CrmTransport;
}):Promise<ExecutionResult>{
 if(input.context.employeeId!=="EMP-003"){
  return executeCapability(createAdapterRegistry(),{context:input.context,capabilityId:"marketing.write",input:input.request,idempotencyKey:input.idempotencyKey},{controlledWriteAuthorization:input.controlledWriteAuthorization});
 }
 const authorization=input.controlledWriteAuthorization;
 if(authorization?.authorized===true){
  if(!authorization.tenantId || authorization.tenantId!==input.context.tenantId) return executeCapability(createAdapterRegistry(),{context:input.context,capabilityId:"marketing.write",input:input.request,idempotencyKey:input.idempotencyKey},{controlledWriteAuthorization:undefined});
  if(!authorization.subjectId || authorization.subjectId!==input.context.actorId) return executeCapability(createAdapterRegistry(),{context:input.context,capabilityId:"marketing.write",input:input.request,idempotencyKey:input.idempotencyKey},{controlledWriteAuthorization:undefined});
 }
 if(input.request.operation==="delete"){
  const registry=createAdapterRegistry();
  registry.register(createMarketingCrmAdapter({async execute(){return {ok:false,error:{code:"MARKETING_DELETE_NOT_VERIFIABLE",message:"EMP-003 delete is disabled until deletion read-back semantics are verifiable"}};}}));
  return executeCapability(registry,{context:input.context,capabilityId:"marketing.write",input:input.request,idempotencyKey:input.idempotencyKey},{controlledWriteAuthorization:authorization});
 }
 const registry=createAdapterRegistry();
 registry.register(createMarketingCrmAdapter({
  async execute(request){
   return executeMarketingCrmWriteWithReadBack({
    tenantId:request.tenantId,
    correlationId:request.correlationId,
    idempotencyKey:request.idempotencyKey ?? "",
    request:{operation:request.operation,entity:request.entity,payload:request.payload},
    writeTransport:input.writeTransport,
    readTransport:input.readTransport
   });
  }
 }));
 return executeCapability(registry,{
  context:input.context,
  capabilityId:"marketing.write",
  input:input.request,
  idempotencyKey:input.idempotencyKey
 },{controlledWriteAuthorization:input.controlledWriteAuthorization});
}
