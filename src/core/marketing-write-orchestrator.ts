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
