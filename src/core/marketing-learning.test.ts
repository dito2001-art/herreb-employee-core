import assert from "node:assert/strict";
import test from "node:test";
import type { MarketingCampaign, MarketingObjective } from "./campaign";
import { learnFromCampaign } from "./marketing-learning";

const objective:MarketingObjective={id:"o1",tenantId:"t1",name:"Leads",outcome:"Demand",targetMetric:"qualified_leads",targetValue:4,startsAt:"s",endsAt:"e"};
const base:MarketingCampaign={id:"c1",tenantId:"t1",objectiveId:"o1",name:"Campaign",audienceIds:[],offeringIds:[],status:"ACTIVE",startsAt:"s",endsAt:"e",actions:[],results:[],createdAt:"c",updatedAt:"u"};

test("learning recommends continue only from measured evidence",()=>{
 const c={...base,results:[{id:"r1",tenantId:"t1",campaignId:"c1",metric:"qualified_leads",value:5,recordedAt:"r",evidenceRefs:["crm:1"]}]};
 const learned=learnFromCampaign({campaign:c,objective,learnedAt:"now"});
 assert.equal(learned.recommendation,"CONTINUE"); assert.equal(learned.actualValue,5); assert.deepEqual(learned.insight.evidenceRefs,["crm:1"]);
});
test("learning flags underperformance and insufficient evidence",()=>{
 const low={...base,results:[{id:"r1",tenantId:"t1",campaignId:"c1",metric:"qualified_leads",value:1,recordedAt:"r",evidenceRefs:["crm:1"]}]};
 assert.equal(learnFromCampaign({campaign:low,objective,learnedAt:"now"}).recommendation,"REVIEW_UNDERPERFORMANCE");
 assert.equal(learnFromCampaign({campaign:base,objective,learnedAt:"now"}).recommendation,"INSUFFICIENT_EVIDENCE");
});
test("learning fails closed across tenant and objective lineage",()=>{
 assert.throws(()=>learnFromCampaign({campaign:base,objective:{...objective,tenantId:"t2"},learnedAt:"now"}),/TENANT_ISOLATION/);
 assert.throws(()=>learnFromCampaign({campaign:base,objective:{...objective,id:"other"},learnedAt:"now"}),/OBJECTIVE_MISMATCH/);
});
