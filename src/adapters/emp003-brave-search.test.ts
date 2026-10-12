import assert from "node:assert/strict";
import test from "node:test";
import { createBraveSearchResearchProvider } from "./emp003-brave-search";

test("Brave research uses scoped tenant and produces HTTPS evidence", async () => {
  let requested = "";
  const provider = createBraveSearchResearchProvider({
    apiKey: "test-key", tenantId: "client-a",
    fetcher: async (input, init) => {
      requested = String(input);
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("X-Subscription-Token"), "test-key");
      return new Response(JSON.stringify({ web: { results: [
        { title: "Source A", description: "Finding A", url: "https://example.com/a" },
        { title: "Unsafe", url: "http://example.com/b" }
      ] } }), { status: 200 });
    }
  });
  const result = await provider.research({ tenantId: "client-a", query: "marketing", correlationId: "corr-1" });
  assert.match(requested, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?/);
  assert.deepEqual(result.sourceRefs, ["https://example.com/a"]);
  assert.equal(result.findings.length, 1);
});

test("Brave research rejects cross-tenant calls before any network access", async () => {
  let called = false;
  const provider = createBraveSearchResearchProvider({
    apiKey: "test-key", tenantId: "client-a",
    fetcher: async () => { called = true; throw new Error("unexpected network call"); }
  });
  await assert.rejects(provider.research({ tenantId: "client-b", query: "market", correlationId: "corr-2" }), /RESEARCH_TENANT_SCOPE_MISMATCH/);
  assert.equal(called, false);
});

test("Brave research rejects empty evidence and upstream failures", async () => {
  const input = { tenantId: "client-a", query: "market", correlationId: "corr-3" };
  const noEvidence = createBraveSearchResearchProvider({
    apiKey: "test-key", tenantId: "client-a",
    fetcher: async () => new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
  });
  await assert.rejects(noEvidence.research(input), /RESEARCH_EVIDENCE_REQUIRED/);
  const failed = createBraveSearchResearchProvider({
    apiKey: "test-key", tenantId: "client-a",
    fetcher: async () => new Response("failure", { status: 503 })
  });
  await assert.rejects(failed.research(input), /RESEARCH_UPSTREAM_HTTP_503/);
});
