import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "./contracts";
import type { ControlledContent } from "./marketing-content-approval";
import { preflightEMP003ContentPublish } from "./emp003-publish-preflight";

const context: TenantContext = { tenantId: "t1", workspaceId: "w1", employeeId: "EMP-003", actorId: "owner", channel: "TEST", correlationId: "corr" };
const content: ControlledContent = { tenantId: "t1", offeringId: "offer", audienceId: "audience", channel: "LINKEDIN", headline: "Headline", body: "Body", claimIds: [], sourceKnowledgeIds: [], status: "PUBLISH_READY", approvedBy: "owner", approvedAt: "now", approvalEvidenceRef: "audit-1" };
const campaign = { tenantId: "t1", campaignTenantId: "t1", reviewState: { state: "APPROVED" as const, publishExecuted: false }, contentStatus: "PUBLISH_READY" as const, approvedBy: "owner", approvalEvidenceRef: "audit-1", channelAuthorized: true, executionPolicyAuthorized: true };

test("EMP-003 preflight allows a fully authorized plan without publishing", () => {
  assert.deepEqual(preflightEMP003ContentPublish({ context, content, campaign }), { ready: true, publishExecuted: false });
});

test("EMP-003 preflight denies mismatched tenant, employee, unapproved content and channel", () => {
  assert.equal(preflightEMP003ContentPublish({ context: { ...context, tenantId: "t2" }, content, campaign }).ready, false);
  assert.equal(preflightEMP003ContentPublish({ context: { ...context, employeeId: "EMP-002" }, content, campaign }).ready, false);
  assert.equal(preflightEMP003ContentPublish({ context, content: { ...content, status: "DRAFT" }, campaign }).ready, false);
  assert.equal(preflightEMP003ContentPublish({ context, content, campaign: { ...campaign, channelAuthorized: false } }).ready, false);
  assert.equal(preflightEMP003ContentPublish({ context, content, campaign: { ...campaign, executionPolicyAuthorized: false } }).ready, false);
});
