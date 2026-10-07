import assert from "node:assert/strict";
import test from "node:test";
import type { TenantMarketingBrain } from "./marketing-brain";
import { planCampaign } from "./campaign-planner";
import { createPersistentCampaignRepository } from "./campaign-persistent";
import { transitionCampaign, recordCampaignResult } from "./campaign";
import { scheduleCampaignAction } from "./campaign-execution";
import { createMarketingLeadHandoff, measureCampaign } from "./marketing-handoff";
import { learnFromCampaign } from "./marketing-learning";

test("EMP-003 internal campaign loop preserves tenant lineage and durable read-back", async () => {
  const tenantId="herreb-client-0";
  const brain:TenantMarketingBrain={tenantId,audiences:[{id:"owners",tenantId,name:"Owners",description:"Business owners",needs:["growth"],channels:["SOCIAL"]}],offerings:[{id:"ai",tenantId,type:"SERVICE",name:"AI Consulting",active:true,metadata:{}}],publishableClaims:[],insights:[],knowledge:[]};
  const objective={id:"obj",tenantId,name:"Qualified demand",outcome:"Generate demand",targetMetric:"qualified_leads",targetValue:1,startsAt:"s",endsAt:"e"};
  let campaign=planCampaign(brain,{tenantId,objective,campaignId:"cmp",name:"AI demand",audienceIds:["owners"],offeringIds:["ai"],startsAt:"s",endsAt:"e",createdAt:"now",correlationId:"corr",channels:["SOCIAL"]});

  const map=new Map<string,string>();
  const repo=createPersistentCampaignRepository({async list(prefix){return [...map].filter(([k])=>k.startsWith(prefix)).map(([key,value])=>({key,value}));},async get(k){return map.get(k);},async put(k,v){map.set(k,v);}});
  await repo.put(tenantId,campaign);
  assert.equal((await repo.get(tenantId,"cmp"))?.status,"PLANNED");

  campaign=transitionCampaign(campaign,"APPROVED","approved");
  const ready={...campaign.actions[0]!,status:"READY" as const};
  campaign={...campaign,actions:[ready],updatedAt:"ready"};
  let durableJob:unknown;
  await scheduleCampaignAction({dispatcher:{async dispatch(job){durableJob=job;return {accepted:true,mode:"SCHEDULE",executionId:"exec1",reason:"accepted"};}},context:{tenantId,employeeId:"EMP-003",workspaceId:"emp003",actorId:"owner",channel:"TEST",correlationId:"corr"},campaign,action:ready,notBefore:"later"});
  assert.equal((durableJob as {requiresApproval:boolean}).requiresApproval,true);

  campaign=recordCampaignResult(campaign,{id:"result1",tenantId,campaignId:"cmp",actionId:ready.id,metric:"qualified_leads",value:1,recordedAt:"after",evidenceRefs:["crm:lead-1"]},"after");
  await repo.put(tenantId,campaign);
  const readBack=(await repo.get(tenantId,"cmp"))!;
  assert.equal(measureCampaign(readBack).totals.qualified_leads,1);

  const handoff=createMarketingLeadHandoff({campaign:readBack,signal:{id:"lead-1",tenantId,campaignId:"cmp",actionId:ready.id,contactKey:"lead@example.com",qualified:true,evidenceRefs:["crm:lead-1"]}});
  assert.equal(handoff.lead.source,"INBOUND");
  assert.equal(handoff.lead.contacted,false);

  const learning=learnFromCampaign({campaign:readBack,objective,learnedAt:"learned"});
  assert.equal(learning.recommendation,"CONTINUE");
  assert.deepEqual(learning.insight.evidenceRefs,["crm:lead-1"]);
  assert.equal((await repo.list("other-tenant")).length,0);
});
