import test from "node:test";
import assert from "node:assert/strict";
import { createMarketingCampaignBlueprint } from "./marketing-campaign-blueprint";

const base = {
 tenantId:"herreb-client-0",correlationId:"c1",objective:"awareness",audiences:["retail buyers"],
 positioning:"reliable partner",keyMessages:["Clear proposition"],
 channels:[{name:"email",actions:["Draft outreach"]}],
 kpis:[{metric:"reply rate",target:"TBD",measurement:"CRM reporting"}],
 assumptions:["Budget not confirmed"],evidenceRefs:["https://developers.cloudflare.com/"]
};
test("blueprint remains evidence-backed and unapproved",()=>{
 const result=createMarketingCampaignBlueprint(base);
 assert.equal(result.status,"DRAFT");
 assert.equal(result.publishApproved,false);
 assert.deepEqual(result.evidenceRefs,base.evidenceRefs);
});
test("blueprint rejects missing evidence and actions",()=>{
 assert.throws(()=>createMarketingCampaignBlueprint({...base,evidenceRefs:[]}));
 assert.throws(()=>createMarketingCampaignBlueprint({...base,channels:[{name:"email",actions:[]}]}));
});
