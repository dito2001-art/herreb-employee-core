import assert from "node:assert/strict";
import test from "node:test";
import type { MarketingCampaign, CampaignAction } from "./campaign";
import { scheduleCampaignAction } from "./campaign-execution";

const action:CampaignAction={id:"a1",tenantId:"t1",campaignId:"c1",channel:"SOCIAL",kind:"CONTENT",status:"READY",idempotencyKey:"idem1",correlationId:"corr"};
const campaign:MarketingCampaign={id:"c1",tenantId:"t1",objectiveId:"o1",name:"C",audienceIds:[],offeringIds:[],status:"APPROVED",startsAt:"s",endsAt:"e",actions:[action],results:[],createdAt:"c",updatedAt:"u"};
const context={tenantId:"t1",employeeId:"EMP-003" as const,actorId:"owner",correlationId:"corr"};

test("approved ready action becomes approval-required durable job",async()=>{
 let captured:unknown; const dispatcher={dispatch:async(job:unknown)=>{captured=job;return {accepted:true,mode:"SCHEDULE" as const,executionId:"x",reason:"queued"}}};
 const result=await scheduleCampaignAction({dispatcher,context,campaign,action,notBefore:"later"});
 assert.equal(result.accepted,true);
 const job=captured as {capabilityId:string;idempotencyKey:string;requiresApproval:boolean;payload:{campaignId:string;actionId:string}};
 assert.equal(job.capabilityId,"campaign.schedule"); assert.equal(job.idempotencyKey,"idem1"); assert.equal(job.requiresApproval,true); assert.deepEqual(job.payload.campaignId,"c1");
});
test("execution fails closed on tenant lineage and unapproved state",async()=>{
 const dispatcher={dispatch:async()=>({accepted:true,mode:"SCHEDULE" as const,reason:"queued"})};
 await assert.rejects(()=>scheduleCampaignAction({dispatcher,context:{...context,tenantId:"t2"},campaign,action,notBefore:"later"}),/TENANT_ISOLATION/);
 await assert.rejects(()=>scheduleCampaignAction({dispatcher,context,campaign:{...campaign,status:"PLANNED"},action,notBefore:"later"}),/NOT_APPROVED/);
 await assert.rejects(()=>scheduleCampaignAction({dispatcher,context,campaign,action:{...action,status:"DRAFT"},notBefore:"later"}),/NOT_READY/);
});
