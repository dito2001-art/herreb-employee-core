import assert from "node:assert/strict";
import test from "node:test";
import { createAdapterRegistry, executeCapability, parseTenantContext } from "../core";
import { createMarketingContentAdapter, createMarketingResearchAdapter } from "./emp003-marketing";

const context = parseTenantContext({
  tenantId: "herreb-client-0",
  employeeId: "EMP-003",
  workspaceId: "marketing",
  actorId: "fernando",
  channel: "test",
  correlationId: "corr-emp003-provider"
});

test("EMP-003 research adapter preserves tenant and requires source evidence", async () => {
  let seenTenant = "";
  const registry = createAdapterRegistry();
  registry.register(createMarketingResearchAdapter({
    async research(input) {
      seenTenant = input.tenantId;
      return { findings: [{ summary: "evidence-based finding" }], sourceRefs: ["https://example.test/source"] };
    }
  }));
  const result = await executeCapability(registry, { context, capabilityId: "research.web", input: { query: "AI consulting demand" } });
  assert.equal(result.ok, true);
  assert.equal(seenTenant, "herreb-client-0");
  assert.deepEqual(result.evidence?.sourceRefs, ["https://example.test/source"]);
});

test("EMP-003 research adapter fails closed without evidence", async () => {
  const registry = createAdapterRegistry();
  registry.register(createMarketingResearchAdapter({ async research() { return { findings: [], sourceRefs: [] }; } }));
  const result = await executeCapability(registry, { context, capabilityId: "research.web", input: { query: "market" } });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "RESEARCH_EVIDENCE_REQUIRED");
});

test("EMP-003 content adapter creates drafts only and never implies publication", async () => {
  const registry = createAdapterRegistry();
  registry.register(createMarketingContentAdapter({
    async createDraft(input) {
      return { draft: { headline: "HerreB AI Employees", tenantId: input.tenantId }, evidenceRefs: ["claim:verified-1"] };
    }
  }));
  const result = await executeCapability(registry, { context, capabilityId: "content.create", input: { brief: { objective: "qualified demand" } } });
  assert.equal(result.ok, true);
  assert.equal((result.output as { status: string }).status, "DRAFT");
  assert.equal(result.evidence?.publishExecuted, false);
});
