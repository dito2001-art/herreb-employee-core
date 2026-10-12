import type { MarketingResearchProvider } from "./emp003-marketing";

export interface BraveSearchOptions {
  apiKey: string;
  tenantId: string;
  fetcher?: typeof fetch;
}

export function createBraveSearchResearchProvider(options: BraveSearchOptions): MarketingResearchProvider {
  const apiKey = options.apiKey.trim();
  const tenantId = options.tenantId.trim();
  if (!apiKey || !tenantId) throw new Error("RESEARCH_PROVIDER_CONFIGURATION_REQUIRED");
  const fetcher = options.fetcher ?? fetch;
  return {
    async research(input) {
      if (input.tenantId !== tenantId) throw new Error("RESEARCH_TENANT_SCOPE_MISMATCH");
      if (!input.correlationId.trim()) throw new Error("RESEARCH_CORRELATION_ID_REQUIRED");
      const query = input.query.trim();
      if (!query || query.length > 300) throw new Error("RESEARCH_QUERY_INVALID");
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "5");
      const response = await fetcher(url.toString(), {
        method: "GET",
        headers: { accept: "application/json", "X-Subscription-Token": apiKey },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`RESEARCH_UPSTREAM_HTTP_${response.status}`);
      const body: unknown = await response.json();
      const results = (body as { web?: { results?: unknown } } | null)?.web?.results;
      if (!Array.isArray(results)) throw new Error("RESEARCH_UPSTREAM_INVALID_RESPONSE");
      const findings: Array<{ title: string; summary: string; url: string }> = [];
      const sourceRefs: string[] = [];
      for (const item of results.slice(0, 5)) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (typeof row.url !== "string" || typeof row.title !== "string") continue;
        let parsed: URL;
        try { parsed = new URL(row.url); } catch { continue; }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) continue;
        findings.push({ title: row.title.slice(0, 300), summary: typeof row.description === "string" ? row.description.slice(0, 1500) : "", url: parsed.toString() });
        sourceRefs.push(parsed.toString());
      }
      if (!sourceRefs.length) throw new Error("RESEARCH_EVIDENCE_REQUIRED");
      return { findings, sourceRefs: [...new Set(sourceRefs)] };
    }
  };
}
