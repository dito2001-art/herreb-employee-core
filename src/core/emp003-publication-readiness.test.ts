import { describe, expect, it } from "vitest";
import { evaluateCampaignPublicationReadiness } from "./emp003-publication-readiness";

const valid = {
  tenantId: "tenant-a",
  campaignTenantId: "tenant-a",
  reviewState: { state: "APPROVED" as const, publishExecuted: false as const },
  contentStatus: "PUBLISH_READY" as const,
  approvedBy: "owner",
  approvalEvidenceRef: "audit-123",
  channelAuthorized: true,
  executionPolicyAuthorized: true
};

describe("EMP-003 publication readiness", () => {
  it("requires all independent gates", () => {
    expect(evaluateCampaignPublicationReadiness(valid)).toEqual({ ready: true, publishExecuted: false });
  });
  it.each([
    [{ campaignTenantId: "tenant-b" }, "TENANT_MISMATCH"],
    [{ reviewState: { state: "DRAFT" as const, publishExecuted: false as const } }, "CAMPAIGN_NOT_APPROVED"],
    [{ contentStatus: "APPROVED" as const }, "CONTENT_APPROVAL_REQUIRED"],
    [{ approvedBy: "" }, "CONTENT_APPROVAL_REQUIRED"],
    [{ approvalEvidenceRef: "" }, "CONTENT_APPROVAL_REQUIRED"],
    [{ channelAuthorized: false }, "CHANNEL_NOT_AUTHORIZED"],
    [{ executionPolicyAuthorized: false }, "EXECUTION_NOT_AUTHORIZED"]
  ])("rejects unsafe conditions", (override, reason) => {
    expect(evaluateCampaignPublicationReadiness({ ...valid, ...override })).toEqual({ ready: false, publishExecuted: false, reason });
  });
});
