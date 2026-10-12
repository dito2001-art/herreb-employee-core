import assert from "node:assert/strict";
import test from "node:test";
import { buildGroundedMarketingBrief } from "./emp003-grounded-brief";

test("grounded brief retains only evidence-backed excerpts and never approves publication", async () => {
  const result = await buildGroundedMarketingBrief({
    async research(input) {
      assert.equal(input.tenantId, "herreb-client-0");
      return { sourceRefs: ["https://example.com/"], findings: [
        { url: "https://example.com/", content: "Campaign evidence" },
        { url: "https://untrusted.example/", content: "Unverified claim" }
      ] };
    }
  }, { tenantId: "herreb-client-0", correlationId: "c-1", topic: "campaign", objective: "awareness", sourceRefs: ["https://example.com/"] });
  assert.deepEqual(result.findings, [{ url: "https://example.com/", excerpt: "Campaign evidence" }]);
  assert.equal(result.publishApproved, false);
  assert.equal(result.status, "RESEARCHED_DRAFT_INPUT");
});

test("grounded brief rejects missing evidence", async () => {
  await assert.rejects(buildGroundedMarketingBrief({
    async research() { return { sourceRefs: [], findings: [] }; }
  }, { tenantId: "herreb-client-0", correlationId: "c-1", topic: "campaign", objective: "awareness", sourceRefs: [] }), /EVIDENCE_REQUIRED/);
});
