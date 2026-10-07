import assert from "node:assert/strict";
import test from "node:test";
import type { MarketingCampaign } from "./campaign";
import { createMarketingLeadHandoff, measureCampaign } from "./marketing-handoff";

const campaign: MarketingCampaign = {
  id:"cmp1",tenantId:"t1",objectiveId:"obj1",name:"Demand",audienceIds:[],offeringIds:[],status:"ACTIVE",
  startsAt:"s",endsAt:"e",createdAt:"c",updatedAt:"u",
  actions:[{id:"a1",tenantId:"t1",campaignId:"cmp1",channel:"SOCIAL",kind:"CONTENT",status:"EXECUTED",idempotencyKey:"k1",correlationId:"corr"}],
  results:[
    {id:"r1",tenantId:"t1",campaignId:"cmp1",actionId:"a1",metric:"qualified_leads",value:2,recordedAt:"r",evidenceRefs:["crm:1"]},
    {id:"r2",tenantId:"t1",campaignId:"cmp1",metric:"qualified_leads",value:3,recordedAt:"r",evidenceRefs:["crm:2"]}
  ]
};

test("marketing lead handoff creates inbound EMP-001 compatible state with evidence",()=>{
 const h=createMarketingLeadHandoff({campaign,signal:{id:"lead1",tenantId:"t1",campaignId:"cmp1",actionId:"a1",contactKey:"contact@example.com",qualified:true,evidenceRefs:["crm:lead1"]}});
 assert.equal(h.lead.source,"INBOUND"); assert.equal(h.lead.qualified,true); assert.equal(h.lead.contacted,false); assert.deepEqual(h.evidenceRefs,["crm:lead1"]);
});
test("marketing lead handoff fails closed across tenant and lineage",()=>{
 assert.throws(()=>createMarketingLeadHandoff({campaign,signal:{id:"x",tenantId:"t2",campaignId:"cmp1",contactKey:"x",evidenceRefs:["e"]}}),/TENANT_ISOLATION/);
 assert.throws(()=>createMarketingLeadHandoff({campaign,signal:{id:"x",tenantId:"t1",campaignId:"cmp1",actionId:"missing",contactKey:"x",evidenceRefs:["e"]}}),/ACTION_NOT_FOUND/);
 assert.throws(()=>createMarketingLeadHandoff({campaign,signal:{id:"x",tenantId:"t1",campaignId:"cmp1",contactKey:"x",evidenceRefs:[]}}),/EVIDENCE_REQUIRED/);
});
test("measurement aggregates metrics and preserves unique evidence",()=>{
 const m=measureCampaign(campaign); assert.equal(m.totals.qualified_leads,5); assert.deepEqual(m.evidenceRefs,["crm:1","crm:2"]);
});
