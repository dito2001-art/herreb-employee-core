import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCampaignPublicationReadiness } from "./emp003-publication-readiness";

const valid = {
  tenantId: "tenant-a",
  campaignTenantId: "tenant-a",
  reviewState: { state: "APPROVED" as const, publishExecuted: false },
  contentStatus: "PUBLISH_READY" as const,
  approvedBy: "owner",
  approvalEvidenceRef: "audit-123",
  channelAuthorized: true,
  executionPolicyAuthorized: true
};

test("EMP-003 publication readiness requires all independent gates", () => {
  assert.deepEqual(evaluateCampaignPublicationReadiness(valid), { ready: true, publishExecuted: false });
});

test("EMP-003 publication readiness rejects unsafe conditions", () => {
  const cases: Array<{ override: Partial<import("./emp003-publication-readiness").CampaignPublicationReadinessInput>; reason: string }> = [
    { override: { campaignTenantId: "tenant-b" }, reason: "TENANT_MISMATCH" },
    { override: { reviewState: { state: "DRAFT", publishExecuted: false } }, reason: "CAMPAIGN_NOT_APPROVED" },
    { override: { contentStatus: "APPROVED" }, reason: "CONTENT_APPROVAL_REQUIRED" },
    { override: { approvedBy: "" }, reason: "CONTENT_APPROVAL_REQUIRED" },
    { override: { approvalEvidenceRef: "" }, reason: "CONTENT_APPROVAL_REQUIRED" },
    { override: { channelAuthorized: false }, reason: "CHANNEL_NOT_AUTHORIZED" },
    { override: { executionPolicyAuthorized: false }, reason: "EXECUTION_NOT_AUTHORIZED" }
  ];
  for (const { override, reason } of cases) {
    assert.deepEqual(evaluateCampaignPublicationReadiness({ ...valid, ...override }), { ready: false, publishExecuted: false, reason });
  }
});
