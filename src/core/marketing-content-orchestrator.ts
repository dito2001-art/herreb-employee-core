import type { MarketingCampaign, MarketingObjective } from "./campaign";
import type { TenantMarketingBrain } from "./marketing-brain";
import { createGroundedContentDraft, type GroundedContentDraft } from "./marketing-content";

export interface ContentGeneratorInput {
 tenantId:string; brandName:string; brandPositioning?:string; brandVoice:string[]; prohibitedThemes:string[];
 audience:{id:string;name:string;description:string;needs:string[]}; offering:{id:string;name:string};
 objective:{id:string;name:string;outcome:string;targetMetric:string;targetValue:number}; campaign:{id:string;name:string};
 channel:string; allowedClaims:{id:string;text:string}[];
}
export interface ContentGeneratorOutput {headline:string;body:string;claimIds:string[];}
export interface ContentGenerator {generate(input:ContentGeneratorInput):Promise<ContentGeneratorOutput>;}

export async function orchestrateGroundedContent(input:{brain:TenantMarketingBrain;campaign:MarketingCampaign;objective:MarketingObjective;offeringId:string;audienceId:string;channel:string;generator:ContentGenerator;}):Promise<GroundedContentDraft>{
 const {brain,campaign,objective}=input;
 if(campaign.tenantId!==brain.tenantId||objective.tenantId!==brain.tenantId) throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
 if(campaign.objectiveId!==objective.id) throw new Error("CONTENT_OBJECTIVE_MISMATCH");
 if(!campaign.offeringIds.includes(input.offeringId)) throw new Error("CONTENT_CAMPAIGN_OFFERING_MISMATCH");
 if(!campaign.audienceIds.includes(input.audienceId)) throw new Error("CONTENT_CAMPAIGN_AUDIENCE_MISMATCH");
 if(!campaign.actions.some(x=>x.channel===input.channel)) throw new Error("CONTENT_CAMPAIGN_CHANNEL_MISMATCH");
 if(!brain.brand) throw new Error("CONTENT_BRAND_PROFILE_REQUIRED");
 const offering=brain.offerings.find(x=>x.id===input.offeringId); if(!offering) throw new Error("CONTENT_OFFERING_NOT_FOUND");
 const audience=brain.audiences.find(x=>x.id===input.audienceId); if(!audience) throw new Error("CONTENT_AUDIENCE_NOT_FOUND");
 const claims=brain.publishableClaims.filter(x=>!x.offeringId||x.offeringId===input.offeringId);
 if(claims.length===0) throw new Error("CONTENT_VERIFIED_CLAIM_REQUIRED");
 const generated=await input.generator.generate({tenantId:brain.tenantId,brandName:brain.brand.name,brandPositioning:brain.brand.positioning,brandVoice:brain.brand.voice,prohibitedThemes:brain.brand.prohibitedThemes,audience:{id:audience.id,name:audience.name,description:audience.description,needs:audience.needs},offering:{id:offering.id,name:offering.name},objective:{id:objective.id,name:objective.name,outcome:objective.outcome,targetMetric:objective.targetMetric,targetValue:objective.targetValue},campaign:{id:campaign.id,name:campaign.name},channel:input.channel,allowedClaims:claims.map(x=>({id:x.id,text:x.text}))});
 return createGroundedContentDraft({brain,offeringId:input.offeringId,audienceId:input.audienceId,channel:input.channel,headline:generated.headline,body:generated.body,claimIds:generated.claimIds});
}
