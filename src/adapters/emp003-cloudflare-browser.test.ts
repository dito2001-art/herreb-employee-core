import assert from "node:assert/strict";
import test from "node:test";
import { createCloudflareBrowserResearchProvider } from "./emp003-cloudflare-browser";

const request = { tenantId: "herreb-client-0", query: "Competitor marketing", correlationId: "corr-123", sourceRefs: ["https://example.com/"] };

test("Browser Run extracts markdown from explicitly allowlisted source", async () => {
  const calls: string[] = [];
  const provider = createCloudflareBrowserResearchProvider({
    tenantId: "herreb-client-0", allowedHosts: ["example.com"],
    browser: { async quickAction(action, options) {
      assert.equal(action, "markdown");
      calls.push(options.url);
      return Response.json({ success: true, result: "# Example source" });
    } }
  });
  const result = await provider.research(request);
  assert.deepEqual(calls, ["https://example.com/"]);
  assert.deepEqual(result.sourceRefs, ["https://example.com/"]);
  assert.equal((result.findings[0] as { content: string }).content, "# Example source");
});

test("Browser Run rejects cross-tenant calls without browsing", async () => {
  let calls = 0;
  const provider = createCloudflareBrowserResearchProvider({
    tenantId: "herreb-client-0", allowedHosts: ["example.com"],
    browser: { async quickAction() { calls++; return Response.json({ success: true, result: "content" }); } }
  });
  await assert.rejects(provider.research({ ...request, tenantId: "other" }), /RESEARCH_TENANT_SCOPE_MISMATCH/);
  assert.equal(calls, 0);
});

test("Browser Run rejects non-allowlisted and non-HTTPS sources before browsing", async () => {
  let calls = 0;
  const provider = createCloudflareBrowserResearchProvider({
    tenantId: "herreb-client-0", allowedHosts: ["example.com"],
    browser: { async quickAction() { calls++; return Response.json({ success: true, result: "content" }); } }
  });
  for (const url of ["http://example.com", "https://other.example.com", "https://example.com:8443", "https://user:pass@example.com", "https://127.0.0.1"]) {
    await assert.rejects(provider.research({ ...request, sourceRefs: [url] }), /RESEARCH_SOURCE_NOT_ALLOWED/);
  }
  assert.equal(calls, 0);
});

test("Browser Run fails closed on empty source content", async () => {
  const provider = createCloudflareBrowserResearchProvider({
    tenantId: "herreb-client-0", allowedHosts: ["example.com"],
    browser: { async quickAction() { return Response.json({ success: true, result: "" }); } }
  });
  await assert.rejects(provider.research(request), /RESEARCH_BROWSER_EMPTY_CONTENT/);
});
