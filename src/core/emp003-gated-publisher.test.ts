import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "./contracts";
import type { ControlledContent } from "./marketing-content-approval";
import { executeEMP003GatedContentPublish } from "./emp003-gated-publisher";

const context: TenantContext = { tenantId: "t1", workspaceId: "w1", employeeId: "EMP-003", actorId: "owner", channel: "TEST", correlationId: "corr" };
const content: ControlledContent = { tenantId: "t1", offeringId: "offer", audienceId: "audience", channel: "LINKEDIN", headline: "Headline", body: "Body", claimIds: [], sourceKnowledgeIds: [], status: "PUBLISH_READY", approvedBy: "owner", approvedAt: "now", approvalEvidenceRef: "audit-1" };
const campaign = { tenantId: "t1", campaignTenantId: "t1", reviewState: { state: "APPROVED" as const, publishExecuted: false }, contentStatus: "PUBLISH_READY" as const, channelAuthorized: true, executionPolicyAuthorized: true };
const authorization = { authorized: true, assurance: "OWNER_VERIFIED" as const, subjectId: "owner", tenantId: "t1", source: "TEST" };

test("EMP-003 gated publisher never invokes provider when any independent gate is missing", async () => {
  let calls = 0;
  const publisher = { async publish() { calls++; return { providerMessageId: "msg", publishedAt: "now", channel: "LINKEDIN" }; } };
  const cases = [
    { campaign: { ...campaign, channelAuthorized: false } },
    { campaign: { ...campaign, executionPolicyAuthorized: false } },
    { campaign: { ...campaign, reviewState: { state: "DRAFT" as const, publishExecuted: false } } },
    { content: { ...content, status: "DRAFT" as const } },
    { context: { ...context, tenantId: "t2" } },
    { authorization: undefined },
    { idempotencyKey: "" }
  ];
  for (const override of cases) {
    const result = await executeEMP003GatedContentPublish({ context, content, campaign, authorization, idempotencyKey: "key", publisher, ...override });
    assert.equal(result.attempted, false);
  }
  assert.equal(calls, 0);
});

test("EMP-003 gated publisher delegates authorized execution to existing controlled-write executor", async () => {
  let calls = 0;
  const result = await executeEMP003GatedContentPublish({
    context, content, campaign, authorization, idempotencyKey: "key:approved",
    publisher: { async publish() { calls++; return { providerMessageId: "msg", publishedAt: "now", channel: "LINKEDIN" }; } }
  });
  assert.equal(result.attempted, true);
  if (result.attempted) assert.equal(result.result.ok, true);
  assert.equal(calls, 1);
});
