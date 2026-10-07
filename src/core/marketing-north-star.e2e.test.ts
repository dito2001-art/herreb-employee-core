import assert from "node:assert/strict";
import test from "node:test";
import { buildTenantMarketingBrain } from "./marketing-brain";
import { planCampaign } from "./campaign-planner";
import { transitionCampaign, recordCampaignResult } from "./campaign";
import { orchestrateGroundedContent } from "./marketing-content-orchestrator";
import { approveGroundedContent, markContentPublishReady } from "./marketing-content-approval";
import { executeControlledContentPublish } from "./marketing-content-publisher";
import { scheduleCampaignAction } from "./campaign-execution";
import { executeEmp003MarketingWrite } from "./marketing-write-orchestrator";
import { createMarketingLeadHandoff } from "./marketing-handoff";
import { attributionFromHandoff, createPersistentMarketingAttributionRepository } from "./marketing-attribution-persistent";
import { learnFromCampaign } from "./marketing-learning";
import { measureCampaign } from "./marketing-handoff";

test("EMP-003 North Star: objective to campaign, execution, CRM, handoff, measurement and learning", async () => {
  const tenantId = "herreb-client-0";
  const context = {
    tenantId,
    workspaceId: "emp003-test",
    employeeId: "EMP-003" as const,
    actorId: "fernando",
    channel: "TEST",
    correlationId: "corr-north-star"
  };
  const brain = buildTenantMarketingBrain({
    tenantId,
    brand: {
      tenantId,
      name: "HerreB",
      positioning: "AI-powered growth partner",
      voice: ["direct", "commercial"],
      prohibitedThemes: ["unsupported guarantees"]
    },
    audiences: [{
      id: "owners",
      tenantId,
      name: "Business owners",
      description: "Owners seeking growth",
      needs: ["qualified demand"],
      channels: ["LINKEDIN"]
    }],
    offerings: [{
      id: "ai-consulting",
      tenantId,
      type: "SERVICE",
      name: "AI Consulting",
      active: true,
      metadata: {}
    }],
    knowledge: [{
      id: "k1",
      tenantId,
      namespace: tenantId,
      kind: "CANONICAL",
      subject: "AI consulting",
      content: { claim: "HerreB provides AI consulting" },
      sourceRefs: ["herreb:service-catalog"],
      confidence: 1,
      verified: true,
      updatedAt: "2026-10-07T00:00:00Z"
    }],
    claims: [{
      id: "claim1",
      tenantId,
      offeringId: "ai-consulting",
      text: "HerreB provides AI consulting",
      sourceKnowledgeIds: ["k1"],
      verified: true
    }]
  });

  const objective = {
    id: "objective-1",
    tenantId,
    name: "Qualified demand",
    outcome: "Generate qualified leads",
    targetMetric: "qualified_leads",
    targetValue: 1,
    startsAt: "2026-10-07",
    endsAt: "2026-10-31"
  };

  let campaign = planCampaign(brain, {
    tenantId,
    objective,
    campaignId: "campaign-1",
    name: "AI Consulting Demand",
    audienceIds: ["owners"],
    offeringIds: ["ai-consulting"],
    startsAt: objective.startsAt,
    endsAt: objective.endsAt,
    createdAt: "2026-10-07T00:00:00Z",
    correlationId: context.correlationId,
    channels: ["LINKEDIN"]
  });
  campaign = transitionCampaign(campaign, "APPROVED", "2026-10-07T01:00:00Z");

  const action = { ...campaign.actions[0]!, status: "READY" as const };
  campaign = { ...campaign, actions: [action], updatedAt: "2026-10-07T01:01:00Z" };

  const draft = await orchestrateGroundedContent({
    brain,
    campaign,
    objective,
    offeringId: "ai-consulting",
    audienceId: "owners",
    channel: "LINKEDIN",
    generator: {
      async generate(input) {
        assert.equal(input.allowedClaims[0]?.id, "claim1");
        return {
          headline: "AI para crecer",
          body: "HerreB ayuda a empresas a trabajar con IA.",
          claimIds: ["claim1"]
        };
      }
    }
  });

  const approved = approveGroundedContent(draft, {
    tenantId,
    approvedBy: context.actorId,
    approvedAt: "2026-10-07T01:02:00Z",
    approvalEvidenceRef: "approval:north-star-1"
  });
  const ready = markContentPublishReady(approved);

  const publish = await executeControlledContentPublish({
    context,
    content: ready,
    idempotencyKey: "publish:campaign-1:linkedin",
    authorization: {
      authorized: true,
      assurance: "OWNER_VERIFIED",
      subjectId: context.actorId,
      tenantId,
      source: "TEST"
    },
    publisher: {
      async publish(input) {
        assert.equal(input.tenantId, tenantId);
        assert.equal(input.channel, "LINKEDIN");
        return {
          providerMessageId: "provider-msg-1",
          publishedAt: "2026-10-07T01:03:00Z",
          channel: input.channel
        };
      }
    }
  });
  assert.equal(publish.ok, true);

  let scheduledJob: unknown;
  const scheduled = await scheduleCampaignAction({
    dispatcher: {
      async dispatch(job) {
        scheduledJob = job;
        return { accepted: true, mode: "SCHEDULE", executionId: "execution-1", reason: "accepted" };
      }
    },
    context,
    campaign,
    action,
    notBefore: "2026-10-08T12:00:00Z"
  });
  assert.equal(scheduled.accepted, true);
  assert.equal((scheduledJob as { capabilityId: string }).capabilityId, "campaign.schedule");

  const crmState: Record<string, unknown> = {
    id: 101,
    campaignId: campaign.id,
    status: "ACTIVE",
    channel: "LINKEDIN"
  };
  const crm = await executeEmp003MarketingWrite({
    context,
    request: {
      operation: "create",
      entity: "marketingCampaigns",
      payload: {
        campaignId: campaign.id,
        status: "ACTIVE",
        channel: "LINKEDIN"
      }
    },
    idempotencyKey: "crm:campaign-1",
    controlledWriteAuthorization: {
      authorized: true,
      assurance: "OWNER_VERIFIED",
      subjectId: context.actorId,
      tenantId,
      source: "TEST"
    },
    writeTransport: {
      async execute() {
        return { ok: true, output: { data: crmState } };
      }
    },
    readTransport: {
      async execute(input) {
        assert.equal(input.operation, "read");
        assert.equal(input.entity, "marketingCampaigns");
        return { ok: true, output: { data: crmState } };
      }
    }
  });
  assert.equal(crm.ok, true);
  assert.equal(crm.evidence?.persistenceConfirmed, true);

  const signal = {
    id: "signal-1",
    tenantId,
    campaignId: campaign.id,
    actionId: action.id,
    contactKey: "lead@example.com",
    qualified: true,
    evidenceRefs: ["crm:lead-101"]
  };
  const handoff = createMarketingLeadHandoff({ campaign, signal });
  assert.equal(handoff.lead.id, "marketing:campaign-1:signal-1");

  const attributionMap = new Map<string, string>();
  const attributionRepo = createPersistentMarketingAttributionRepository({
    async list(prefix) {
      return [...attributionMap.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value }));
    },
    async get(key) {
      return attributionMap.get(key);
    },
    async put(key, value) {
      attributionMap.set(key, value);
    }
  });
  const attribution = attributionFromHandoff(handoff, {
    signalId: signal.id,
    correlationId: context.correlationId,
    createdAt: "2026-10-07T01:04:00Z"
  });
  await attributionRepo.put(tenantId, attribution);
  assert.deepEqual(await attributionRepo.get(tenantId, attribution.id), attribution);

  campaign = recordCampaignResult(campaign, {
    id: "result-1",
    tenantId,
    campaignId: campaign.id,
    actionId: action.id,
    metric: "qualified_leads",
    value: 1,
    recordedAt: "2026-10-07T01:05:00Z",
    evidenceRefs: ["crm:lead-101"]
  }, "2026-10-07T01:05:00Z");

  const measurement = measureCampaign(campaign);
  assert.equal(measurement.totals.qualified_leads, 1);
  const learning = learnFromCampaign({
    campaign,
    objective,
    learnedAt: "2026-10-07T01:06:00Z"
  });
  assert.equal(learning.recommendation, "CONTINUE");
  assert.deepEqual(learning.insight.evidenceRefs, ["crm:lead-101"]);
});
