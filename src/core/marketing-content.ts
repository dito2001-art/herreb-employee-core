import type { TenantMarketingBrain } from "./marketing-brain";

export interface GroundedContentDraft {
 tenantId:string; offeringId:string; audienceId:string; channel:string;
 headline:string; body:string; claimIds:string[]; sourceKnowledgeIds:string[];
 status:"DRAFT";
}

export function createGroundedContentDraft(input:{
 brain:TenantMarketingBrain; offeringId:string; audienceId:string; channel:string;
 headline:string; body:string; claimIds:string[];
}):GroundedContentDraft {
 const {brain}=input;
 const offering=brain.offerings.find(x=>x.id===input.offeringId);
 if(!offering) throw new Error("CONTENT_OFFERING_NOT_FOUND");
 const audience=brain.audiences.find(x=>x.id===input.audienceId);
 if(!audience) throw new Error("CONTENT_AUDIENCE_NOT_FOUND");
 if(!input.channel.trim()) throw new Error("CONTENT_CHANNEL_REQUIRED");
 if(input.claimIds.length===0) throw new Error("CONTENT_VERIFIED_CLAIM_REQUIRED");
 const claims=input.claimIds.map(id=>{
  const claim=brain.publishableClaims.find(x=>x.id===id);
  if(!claim) throw new Error(`CONTENT_CLAIM_NOT_PUBLISHABLE:${id}`);
  if(claim.tenantId!==brain.tenantId) throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  if(claim.offeringId && claim.offeringId!==input.offeringId) throw new Error(`CONTENT_CLAIM_OFFERING_MISMATCH:${id}`);
  return claim;
 });
 const sourceKnowledgeIds=[...new Set(claims.flatMap(x=>x.sourceKnowledgeIds))];
 return {tenantId:brain.tenantId,offeringId:input.offeringId,audienceId:input.audienceId,channel:input.channel,headline:input.headline,body:input.body,claimIds:[...input.claimIds],sourceKnowledgeIds,status:"DRAFT"};
}
