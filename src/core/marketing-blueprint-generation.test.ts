import test from "node:test";
import assert from "node:assert/strict";
import { parseGeneratedCampaignBlueprint } from "./marketing-blueprint-generation";
const input={tenantId:"herreb-client-0",correlationId:"c1",objective:"awareness",evidenceRefs:["https://developers.cloudflare.com/"]};
test("model cannot override trusted tenant, objective, sources, or approval",()=>{
 const result=parseGeneratedCampaignBlueprint({...input,modelOutput:JSON.stringify({
 tenantId:"evil",objective:"other",publishApproved:true,status:"APPROVED",evidenceRefs:["https://evil.example"],
 audiences:["B2B"],positioning:"Expert",keyMessages:["Simple"],
 channels:[{name:"email",actions:["Write draft"]}],kpis:[{metric:"leads",target:"TBD",measurement:"CRM"}],assumptions:[]
 })});
 assert.equal(result.tenantId,input.tenantId);
 assert.equal(result.objective,input.objective);
 assert.deepEqual(result.evidenceRefs,input.evidenceRefs);
 assert.equal(result.status,"DRAFT");
 assert.equal(result.publishApproved,false);
});
test("invalid model JSON fails closed",()=>assert.throws(()=>parseGeneratedCampaignBlueprint({...input,modelOutput:"not-json"}),/JSON_INVALID/));
