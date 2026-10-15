import assert from "node:assert/strict";
import test from "node:test";
import type { MarketingCampaignBlueprint } from "./marketing-campaign-blueprint";
import { buildEMP003CampaignOperations } from "./emp003-campaign-operations-view";

const blueprint: MarketingCampaignBlueprint = {
  tenantId: "tenant-a", correlationId: "corr", objective: "Increase qualified leads",
  audiences: ["B2B"], positioning: "Useful", keyMessages: ["Value"],
  channels: [{ name: "email", actions: ["draft"] }],
  kpis: [{ metric: "leads", target: "10", measurement: "CRM" }],
  assumptions: [], evidenceRefs: ["https://example.com/source"], status: "DRAFT", publishApproved: false
};

test("EMP-003 campaign operations keep approved campaign unpublished", () => {
  const result = buildEMP003CampaignOperations({ tenantId: "tenant-a", campaigns: [{ campaignId: "c1", blueprint, reviewState: "APPROVED" }] });
  assert.deepEqual(result, [{ campaignId: "c1", tenantId: "tenant-a", objective: blueprint.objective, state: "APPROVED", requiresOwnerReview: false, publishAuthorized: false, publishExecuted: false }]);
});

test("EMP-003 campaign operations default to draft requiring review", () => {
  const result = buildEMP003CampaignOperations({ tenantId: "tenant-a", campaigns: [{ campaignId: "c1", blueprint }] });
  assert.equal(result[0]?.requiresOwnerReview, true);
  assert.equal(result[0]?.state, "DRAFT");
});

test("EMP-003 campaign operations fail closed on tenant mismatch and duplicate campaign IDs", () => {
  assert.throws(() => buildEMP003CampaignOperations({ tenantId: "tenant-b", campaigns: [{ campaignId: "c1", blueprint }] }), /EMP003_CAMPAIGN_SCOPE_REJECTED/);
  assert.throws(() => buildEMP003CampaignOperations({ tenantId: "tenant-a", campaigns: [{ campaignId: "c1", blueprint }, { campaignId: "c1", blueprint }] }), /EMP003_CAMPAIGN_DUPLICATE_ID/);
});
