import assert from "node:assert/strict";
import test from "node:test";

import { buildTenantMarketingBrain } from "./marketing-brain";
import type { KnowledgeRecord } from "./knowledge";

const canonical: KnowledgeRecord = {
  id: "k-verified",
  tenantId: "tenant-a",
  kind: "CANONICAL",
  subject: "offering:service-1",
  content: "Service 1 includes strategic consulting.",
  source: { type: "TENANT_DECLARED", ref: "onboarding" },
  status: "VERIFIED",
  confidence: 1,
  createdAt: "2026-09-15T13:00:00Z",
  updatedAt: "2026-09-15T13:00:00Z"
};

const retrieved: KnowledgeRecord = {
  ...canonical,
  id: "k-retrieved",
  kind: "RETRIEVED",
  source: { type: "WEB", ref: "public-research" }
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

test("marketing brain rejects cross-tenant knowledge, brand, audience, claims and insights", () => {
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
        sourceSystem: "tenant-offerings",
        sourceId: "service-1"
      }
    ],
    knowledge: [canonical]
  });

  assert.equal(brain.offerings.length, 1);
  assert.equal(brain.offerings[0]?.name, "AI Consulting");
});
