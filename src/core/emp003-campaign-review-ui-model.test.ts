import assert from "node:assert/strict";
import test from "node:test";
import { buildEMP003ReviewCards } from "./emp003-campaign-review-ui-model";

const blueprint = {
  tenantId: "herreb-client-0", correlationId: "corr", objective: "Generate B2B demand",
  audiences: ["buyers"], positioning: "reliable", keyMessages: ["value"],
  channels: [{ name: "Email", actions: ["Prepare a draft"] }],
  kpis: [{ metric: "leads", target: "10", measurement: "CRM" }],
  assumptions: [], evidenceRefs: ["https://example.com"], status: "DRAFT", publishApproved: false
};
const payload = (state: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" = "DRAFT") => ({
  ok: true, tenantId: "herreb-client-0", campaigns: [{
    campaignId: "campaign-1", blueprint: { ...blueprint }, reviewState: state, reviewRevision: 1,
    requiresOwnerReview: state === "DRAFT" || state === "IN_REVIEW",
    publishAuthorized: false, publishExecuted: false
  }]
});

test("owner review cards never imply publication", () => {
  const draft = buildEMP003ReviewCards(payload(), "herreb-client-0")[0];
  assert.equal(draft.canSubmitForReview, true);
  assert.equal(draft.canApprove, false);
  const reviewing = buildEMP003ReviewCards(payload("IN_REVIEW"), "herreb-client-0")[0];
  assert.equal(reviewing.canApprove, true);
  assert.equal(reviewing.canReject, true);
  const approved = buildEMP003ReviewCards(payload("APPROVED"), "herreb-client-0")[0];
  assert.equal(approved.canApprove, false);
  assert.equal(approved.publishAuthorized, false);
  assert.equal(approved.publishExecuted, false);
});

test("review cards reject cross-tenant data and forged publication", () => {
  assert.throws(() => buildEMP003ReviewCards(payload(), "other-tenant"), /EMP003_REVIEW_UI_TENANT_MISMATCH/);
  const forged = payload();
  forged.campaigns[0].publishAuthorized = true;
  assert.throws(() => buildEMP003ReviewCards(forged, "herreb-client-0"));
  const cross = payload();
  cross.campaigns[0].blueprint.tenantId = "other-tenant";
  assert.throws(() => buildEMP003ReviewCards(cross, "herreb-client-0"), /EMP003_REVIEW_UI_CAMPAIGN_SCOPE_REJECTED/);
});

test("review cards reject duplicate campaigns and inconsistent review flags", () => {
  const duplicate = payload();
  duplicate.campaigns.push({ ...duplicate.campaigns[0] });
  assert.throws(() => buildEMP003ReviewCards(duplicate, "herreb-client-0"), /EMP003_REVIEW_UI_DUPLICATE_CAMPAIGN/);
  const inconsistent = payload("APPROVED");
  inconsistent.campaigns[0].requiresOwnerReview = true;
  assert.throws(() => buildEMP003ReviewCards(inconsistent, "herreb-client-0"), /EMP003_REVIEW_UI_STATE_MISMATCH/);
});
