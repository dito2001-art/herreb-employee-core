import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeCampaignTransition, createCampaignAuditRecord, validateCampaignForReview } from "./marketing-campaign-lifecycle";

const base = { tenantId: "herreb-client-0", campaignId: "cmp-1", correlationId: "corr-1", actorId: "owner-1", actorRole: "owner", from: "IN_REVIEW", to: "APPROVED", reason: "Reviewed evidence and copy", idempotencyKey: "approval-1" };

test("owner may approve own tenant campaign", () => {
  assert.equal(authorizeCampaignTransition(base, "herreb-client-0").to, "APPROVED");
});
test("approval denied for another tenant", () => {
  assert.throws(() => authorizeCampaignTransition(base, "other-tenant"), /EMP003_TENANT_SCOPE_REJECTED/);
});
test("operator cannot approve", () => {
  assert.throws(() => authorizeCampaignTransition({ ...base, actorRole: "operator" }, "herreb-client-0"), /EMP003_CAMPAIGN_TRANSITION_DENIED/);
});
test("reviewer cannot approve", () => {
  assert.throws(() => authorizeCampaignTransition({ ...base, actorRole: "reviewer" }, "herreb-client-0"), /EMP003_CAMPAIGN_TRANSITION_DENIED/);
});
test("draft cannot skip review", () => {
  assert.throws(() => authorizeCampaignTransition({ ...base, from: "DRAFT" }, "herreb-client-0"), /EMP003_CAMPAIGN_TRANSITION_DENIED/);
});
test("missing idempotency key rejected", () => {
  assert.throws(() => authorizeCampaignTransition({ ...base, idempotencyKey: "" }, "herreb-client-0"));
});
test("rejected campaign can return to draft", () => {
  assert.equal(authorizeCampaignTransition({ ...base, from: "REJECTED", to: "DRAFT", actorRole: "operator" }, "herreb-client-0").to, "DRAFT");
});
test("audit record is frozen, nonpublishing and time-stamped", () => {
  const event = createCampaignAuditRecord(base, "herreb-client-0", "2026-10-13T00:00:00.000Z");
  assert.equal(event.publishExecuted, false);
  assert.equal(event.eventType, "EMP003_CAMPAIGN_STATE_TRANSITION");
  assert.equal(Object.isFrozen(event), true);
});
test("invalid audit timestamp rejected", () => {
  assert.throws(() => createCampaignAuditRecord(base, "herreb-client-0", "not-a-date"), /EMP003_AUDIT_TIMESTAMP_INVALID/);
});
test("review requires valid draft blueprint and tenant", () => {
  const blueprint = { tenantId: "herreb-client-0", correlationId: "corr-1", objective: "Grow leads", audiences: ["B2B"], positioning: "Helpful", keyMessages: ["Fast"], channels: [{ name: "Email", actions: ["Draft"] }], kpis: [{ metric: "Leads", target: "TBD", measurement: "CRM" }], assumptions: [], evidenceRefs: ["https://developers.cloudflare.com/"], status: "DRAFT", publishApproved: false };
  assert.equal(validateCampaignForReview(blueprint, "herreb-client-0").status, "DRAFT");
  assert.throws(() => validateCampaignForReview(blueprint, "other-tenant"), /EMP003_CAMPAIGN_REVIEW_SCOPE_REJECTED/);
  assert.throws(() => validateCampaignForReview({ ...blueprint, publishApproved: true }, "herreb-client-0"));
});
