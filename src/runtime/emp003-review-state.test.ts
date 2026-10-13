import { strict as assert } from "node:assert";
import { test } from "node:test";
import { advanceEMP003ReviewState, initialEMP003ReviewState } from "./emp003-review-state";

const transition = (to: "IN_REVIEW" | "APPROVED", from: "DRAFT" | "IN_REVIEW", role: "operator" | "owner" = "owner") => ({
  tenantId: "tenant-a", campaignId: "campaign-a", correlationId: "corr-1", actorId: "actor-a",
  actorRole: role, from, to, reason: "Review requested", idempotencyKey: "idem-1",
});

test("review state advances separately from immutable draft", () => {
  const draft = initialEMP003ReviewState("tenant-a", "campaign-a");
  const review = advanceEMP003ReviewState(draft, transition("IN_REVIEW", "DRAFT", "operator"));
  const approved = advanceEMP003ReviewState(review, transition("APPROVED", "IN_REVIEW"));
  assert.equal(draft.state, "DRAFT");
  assert.equal(approved.state, "APPROVED");
  assert.equal(approved.revision, 2);
  assert.equal(approved.publishExecuted, false);
});

test("review state rejects stale, cross-tenant, cross-campaign and unauthorized approval", () => {
  const draft = initialEMP003ReviewState("tenant-a", "campaign-a");
  assert.throws(() => advanceEMP003ReviewState(draft, transition("APPROVED", "IN_REVIEW")));
  assert.throws(() => advanceEMP003ReviewState(draft, { ...transition("IN_REVIEW", "DRAFT"), tenantId: "tenant-b" }));
  assert.throws(() => advanceEMP003ReviewState(draft, { ...transition("IN_REVIEW", "DRAFT"), campaignId: "campaign-b" }));
  const review = advanceEMP003ReviewState(draft, transition("IN_REVIEW", "DRAFT"));
  assert.throws(() => advanceEMP003ReviewState(review, transition("APPROVED", "IN_REVIEW", "operator")));
});
