import assert from "node:assert/strict";
import test from "node:test";
import { runMarketingPlanningCycle } from "./marketing-cycle";

const context = (tenantId = "tenant-a") => ({
  tenantId,
  employeeId: "EMP-003" as const,
  workspaceId: "marketing",
  actorId: "client-user",
  channel: "portal",
  correlationId: "corr-mkt-001"
});

const brain = (tenantId = "tenant-a") => ({
  tenantId,
  audiences: [{ id: "aud-1", tenantId, name: "Professionals", description: "Professionals 25-45", needs: [], channels: ["META"] }],
  offerings: [{ id: "premium", tenantId, type: "PHYSICAL_PRODUCT" as const, name: "Premium", active: true }],
  publishableClaims: [{ id: "claim-1", tenantId, offeringId: "premium", text: "Verified", sourceKnowledgeIds: ["k-1"], verified: true }],
  insights: [],
  knowledge: []
});

test("EMP003 turns a tenant objective into a plan and YELLOW approval request", () => {
  const result = runMarketingPlanningCycle({
    context: context(),
    brain: brain(),
    objective: { id: "obj-1", tenantId: "tenant-a", title: "Grow premium sales", target: "+25% sales", budget: 3000000, currency: "PYG" }
  });

  assert.equal(result.plan.objectiveId, "obj-1");
  assert.deepEqual(result.plan.offeringIds, ["premium"]);
  assert.deepEqual(result.plan.publishableClaimIds, ["claim-1"]);
  assert.equal(result.approval?.decision, "REQUIRE_APPROVAL");
  assert.equal(result.approval?.capabilityId, "campaign.schedule");
  assert.equal(result.approval?.budget, 3000000);
  assert.equal(result.approval?.correlationId, "corr-mkt-001");
});

test("GREEN content drafting needs no approval", () => {
  const result = runMarketingPlanningCycle({
    context: context(),
    brain: brain(),
    objective: { id: "obj-2", tenantId: "tenant-a", title: "Draft content", target: "Create draft" },
    executionCapabilityId: "content.create"
  });
  assert.equal(result.approval, undefined);
});

test("planning fails closed before action when objective or brain belongs to another tenant", () => {
  assert.throws(() => runMarketingPlanningCycle({
    context: context("tenant-a"),
    brain: brain("tenant-b"),
    objective: { id: "obj-x", tenantId: "tenant-a", title: "Forbidden", target: "Never execute" }
  }), /MARKETING_TENANT_ISOLATION_VIOLATION/);
});
