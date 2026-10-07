import { createAdapterRegistry, type CapabilityAdapter } from "./adapters";
import type { TenantContext } from "./contracts";
import { executeCapability, type ControlledWriteAuthorization, type ExecutionResult } from "./executor";
import type { ControlledContent } from "./marketing-content-approval";

export interface ContentPublishReceipt {providerMessageId:string;publishedAt:string;channel:string;}
export interface ContentPublisher {publish(input:{tenantId:string;channel:string;headline:string;body:string;idempotencyKey:string;correlationId:string;}):Promise<ContentPublishReceipt>;}

function createContentPublishAdapter(publisher:ContentPublisher):CapabilityAdapter<{content:ControlledContent},ContentPublishReceipt>{
 return {id:"emp003-content-publisher",capabilities:["content.publish"],employees:["EMP-003"],async execute(request){
  const content=request.input.content;
  if(content.tenantId!==request.context.tenantId) throw new Error("CONTENT_PUBLISH_TENANT_MISMATCH");
  if(content.status!=="PUBLISH_READY"||!content.approvedBy||!content.approvalEvidenceRef) throw new Error("CONTENT_NOT_PUBLISH_READY");
  if(!request.idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const receipt=await publisher.publish({tenantId:request.context.tenantId,channel:content.channel,headline:content.headline,body:content.body,idempotencyKey:request.idempotencyKey,correlationId:request.context.correlationId});
  if(!receipt.providerMessageId.trim()||!receipt.publishedAt.trim()||receipt.channel!==content.channel) throw new Error("CONTENT_PUBLISH_EVIDENCE_INVALID");
  return {ok:true,output:receipt,evidence:{providerMessageId:receipt.providerMessageId,publishedAt:receipt.publishedAt,channel:receipt.channel,approvalEvidenceRef:content.approvalEvidenceRef}};
 }};
}

export async function executeControlledContentPublish(input:{context:TenantContext;content:ControlledContent;idempotencyKey:string;authorization?:ControlledWriteAuthorization;publisher:ContentPublisher;}):Promise<ExecutionResult<ContentPublishReceipt>>{
 const registry=createAdapterRegistry(); registry.register(createContentPublishAdapter(input.publisher));
 return executeCapability(registry,{context:input.context,capabilityId:"content.publish",input:{content:input.content},idempotencyKey:input.idempotencyKey},{controlledWriteAuthorization:input.authorization});
}
