import type { MarketingResearchProvider } from "./emp003-marketing";

export interface BrowserMarkdownBinding {
  quickAction(action: "markdown", options: { url: string }): Promise<Response>;
}

export interface BrowserResearchOptions {
  browser: BrowserMarkdownBinding;
  tenantId: string;
  allowedHosts: readonly string[];
}

function safeSource(value: string, allowedHosts: ReadonlySet<string>): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedHosts.has(url.hostname.toLowerCase()) || url.hostname.endsWith(".local")) {
    throw new Error("RESEARCH_SOURCE_NOT_ALLOWED");
  }
  return url;
}

/** Fetches explicit, allowlisted URLs only. This is not a general web search engine. */
export function createCloudflareBrowserResearchProvider(options: BrowserResearchOptions): MarketingResearchProvider {
  const tenantId = options.tenantId.trim();
  const hosts = new Set(options.allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (!tenantId || hosts.size === 0) throw new Error("RESEARCH_BROWSER_CONFIGURATION_REQUIRED");
  return {
    async research(input) {
      if (input.tenantId !== tenantId) throw new Error("RESEARCH_TENANT_SCOPE_MISMATCH");
      if (!input.correlationId.trim() || !input.query.trim()) throw new Error("RESEARCH_INPUT_REQUIRED");
      const sources = input.sourceRefs ?? [];
      if (!sources.length || sources.length > 3) throw new Error("RESEARCH_SOURCES_REQUIRED");
      const urls = sources.map((source) => safeSource(source, hosts));
      const findings: Array<{ url: string; content: string }> = [];
      for (const url of urls) {
        const response = await options.browser.quickAction("markdown", { url: url.toString() });
        if (!response.ok) throw new Error("RESEARCH_BROWSER_UPSTREAM_FAILED");
        const body: unknown = await response.json();
        const data = body as { success?: unknown; result?: unknown } | null;
        if (!data || data.success !== true || typeof data.result !== "string" || !data.result.trim()) {
          throw new Error("RESEARCH_BROWSER_EMPTY_CONTENT");
        }
        findings.push({ url: url.toString(), content: data.result.slice(0, 12000) });
      }
      return { findings, sourceRefs: urls.map((url) => url.toString()) };
    }
  };
}
