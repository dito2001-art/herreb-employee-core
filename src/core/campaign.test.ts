import assert from "node:assert/strict";
import test from "node:test";
import { MarketingCampaignSchema, addCampaignAction, recordCampaignResult, transitionCampaign } from "./campaign";

const base=MarketingCampaignSchema.parse({
 id:"cmp-1",tenantId:"tenant-a",objectiveId:"obj-1",name:"EMP-003 launch",startsAt:"2026-10-10T00:00:00Z",endsAt:"2026-11-10T00:00:00Z",
 createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:00Z"
});
test("campaign lifecycle allows only explicit transitions",()=>{
 const planned=transitionCampaign(base,"PLANNED","2026-10-07T01:00:00Z");
 const approved=transitionCampaign(planned,"APPROVED","2026-10-07T02:00:00Z");
 assert.equal(approved.status,"APPROVED");
 assert.throws(()=>transitionCampaign(base,"ACTIVE","x"),/INVALID_CAMPAIGN_TRANSITION/);
});
test("campaign actions are tenant scoped and idempotent",()=>{
 const action={id:"a-1",tenantId:"tenant-a",campaignId:"cmp-1",channel:"WHATSAPP",kind:"OUTREACH",status:"DRAFT" as const,idempotencyKey:"cmp-1:a-1",correlationId:"corr-1"};
 const once=addCampaignAction(base,action,"t1"); const twice=addCampaignAction(once,{...action,id:"a-2"},"t2");
 assert.equal(twice.actions.length,1);
 assert.throws(()=>addCampaignAction(base,{...action,tenantId:"tenant-b"},"t"),/TENANT_ISOLATION/);
});
test("results require campaign/action lineage and preserve evidence",()=>{
 const action={id:"a-1",tenantId:"tenant-a",campaignId:"cmp-1",channel:"CRM",kind:"LEAD_CAPTURE",status:"EXECUTED" as const,idempotencyKey:"k",correlationId:"c"};
 const withAction=addCampaignAction(base,action,"t1");
 const result={id:"r-1",tenantId:"tenant-a",campaignId:"cmp-1",actionId:"a-1",metric:"qualified_leads",value:1,recordedAt:"t2",evidenceRefs:["crm:lead:1"]};
 const recorded=recordCampaignResult(withAction,result,"t2");
 assert.equal(recorded.results[0]?.evidenceRefs[0],"crm:lead:1");
 assert.throws(()=>recordCampaignResult(base,result,"t2"),/ACTION_NOT_FOUND/);
});
