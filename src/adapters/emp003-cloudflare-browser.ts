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

function extractLinks(markdown: string, base: URL, allowedHosts: ReadonlySet<string>): URL[] {
  const links = new Map<string, URL>();
  const pattern = /!?\[[^\]]*\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    try {
      const url = safeSource(new URL(match[1], base).toString(), allowedHosts);
      url.hash = "";
      if (url.pathname !== "/") links.set(url.toString(), url);
    } catch {
      // Untrusted page links are ignored unless they pass the explicit source policy.
    }
  }
  return [...links.values()];
}

function relevance(url: URL, query: string): number {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const candidate = (url.pathname + " " + url.hostname).toLowerCase();
  return terms.reduce((score, term) => score + (candidate.includes(term) ? 1 : 0), 0);
}

async function readMarkdown(browser: BrowserMarkdownBinding, url: URL): Promise<string> {
  const response = await browser.quickAction("markdown", { url: url.toString() });
  if (!response.ok) {
    // Never log page content, tokens, or response bodies. Preserve only status and safe diagnostic metadata.
    const diagnostic = response.headers.get("cf-ray")?.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
    console.error("EMP003_BROWSER_MARKDOWN_HTTP_FAILURE", { status: response.status, cfRay: diagnostic ?? null });
    throw new Error("RESEARCH_BROWSER_HTTP_" + response.status);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("RESEARCH_BROWSER_INVALID_JSON"); }
  const data = body as { success?: unknown; result?: unknown } | null;
  if (!data || data.success !== true || typeof data.result !== "string" || !data.result.trim()) {
    throw new Error("RESEARCH_BROWSER_EMPTY_CONTENT");
  }
  return data.result.slice(0, 12000);
}

/**
 * Researches explicit seed pages, then discovers a small number of relevant links
 * on those pages. It does not query a general-purpose search index.
 */
export function createCloudflareBrowserResearchProvider(options: BrowserResearchOptions): MarketingResearchProvider {
  const tenantId = options.tenantId.trim();
  const hosts = new Set(options.allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (!tenantId || hosts.size === 0) throw new Error("RESEARCH_BROWSER_CONFIGURATION_REQUIRED");
  return {
    async research(input) {
      if (input.tenantId !== tenantId) throw new Error("RESEARCH_TENANT_SCOPE_MISMATCH");
      if (!input.correlationId.trim() || !input.query.trim()) throw new Error("RESEARCH_INPUT_REQUIRED");
      const seeds = input.sourceRefs ?? [];
      if (!seeds.length || seeds.length > 2) throw new Error("RESEARCH_SOURCES_REQUIRED");
      const seedUrls = seeds.map((source) => safeSource(source, hosts));
      const collected = new Map<string, { url: string; content: string }>();
      const discovered: URL[] = [];
      for (const seed of seedUrls) {
        const markdown = await readMarkdown(options.browser, seed);
        collected.set(seed.toString(), { url: seed.toString(), content: markdown });
        for (const link of extractLinks(markdown, seed, hosts)) {
          if (!collected.has(link.toString()) && !discovered.some((item) => item.toString() === link.toString())) discovered.push(link);
        }
      }
      const candidates = discovered
        .map((url) => ({ url, score: relevance(url, input.query) }))
        .sort((a, b) => b.score - a.score || a.url.toString().localeCompare(b.url.toString()))
        .slice(0, Math.max(0, 3 - collected.size));
      for (const candidate of candidates) {
        try {
          const content = await readMarkdown(options.browser, candidate.url);
          collected.set(candidate.url.toString(), { url: candidate.url.toString(), content });
        } catch {
          // Optional discovered pages may be unavailable. Preserve verified seed evidence.
          // Explicit seed failures above still fail closed.
        }
      }
      return { findings: [...collected.values()], sourceRefs: [...collected.keys()] };
    }
  };
}
