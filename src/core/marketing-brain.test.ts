import assert from "node:assert/strict";
import test from "node:test";

import type { KnowledgeRecord } from "./knowledge";
import { buildTenantMarketingBrain } from "./marketing-brain";

const canonical: KnowledgeRecord = {
  id: "k-verified",
  tenantId: "tenant-a",
  namespace: "marketing",
  kind: "CANONICAL",
  subject: "offering:service-1",
  content: { statement: "Service 1 includes strategic consulting." },
  sourceRefs: ["onboarding"],
  confidence: 1,
  verified: true,
  updatedAt: "2026-09-15T13:00:00Z"
};

const retrieved: KnowledgeRecord = {
  ...canonical,
  id: "k-retrieved",
  kind: "RETRIEVED",
  sourceRefs: ["public-research"]
};

test("marketing brain publishes only claims backed by verified canonical truth", () => {
  const brain = buildTenantMarketingBrain({
    tenantId: "tenant-a",
    knowledge: [canonical, retrieved],
    claims: [
      {
        id: "claim-ok",
        tenantId: "tenant-a",
        text: "Service 1 includes strategic consulting.",
        sourceKnowledgeIds: [canonical.id],
        verified: true
      },
      {
        id: "claim-research",
        tenantId: "tenant-a",
        text: "Unverified market claim",
        sourceKnowledgeIds: [retrieved.id],
        verified: true
      },
      {
        id: "claim-missing",
        tenantId: "tenant-a",
        text: "Unsupported claim",
        sourceKnowledgeIds: ["missing"],
        verified: true
      }
    ]
  });

  assert.deepEqual(
    brain.publishableClaims.map((claim) => claim.id),
    ["claim-ok"]
  );
});

test("marketing brain rejects cross-tenant knowledge, brand and audience", () => {
  assert.throws(
    () =>
      buildTenantMarketingBrain({
        tenantId: "tenant-a",
        knowledge: [{ ...canonical, tenantId: "tenant-b" }]
      }),
    /TENANT_ISOLATION/
  );
  assert.throws(
    () =>
      buildTenantMarketingBrain({
        tenantId: "tenant-a",
        brand: {
          tenantId: "tenant-b",
          name: "Wrong tenant",
          voice: [],
          prohibitedThemes: []
        }
      }),
    /MARKETING_TENANT_ISOLATION/
  );
  assert.throws(
    () =>
      buildTenantMarketingBrain({
        tenantId: "tenant-a",
        audiences: [
          {
            id: "aud-1",
            tenantId: "tenant-b",
            name: "Wrong",
            description: "Wrong tenant audience",
            needs: [],
            channels: []
          }
        ]
      }),
    /MARKETING_TENANT_ISOLATION/
  );
});

test("marketing brain preserves standalone EMP-003 offering context", () => {
  const brain = buildTenantMarketingBrain({
    tenantId: "tenant-a",
    offerings: [
      {
        id: "service-1",
        tenantId: "tenant-a",
        type: "SERVICE",
        name: "AI Consulting",
        active: true,
        metadata: { source: "tenant-offerings" }
      }
    ],
    knowledge: [canonical]
  });

  assert.equal(brain.offerings.length, 1);
  assert.equal(brain.offerings[0]?.name, "AI Consulting");
});
