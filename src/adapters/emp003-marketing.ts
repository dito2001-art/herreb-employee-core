import type { CapabilityAdapter, CapabilityRequest, CapabilityResult } from "../core";

export interface MarketingResearchProvider {
  research(input: {
    tenantId: string;
    query: string;
    sourceRefs?: string[];
    correlationId: string;
  }): Promise<{ findings: unknown[]; sourceRefs: string[] }>;
}

export interface MarketingContentProvider {
  createDraft(input: {
    tenantId: string;
    brief: Record<string, unknown>;
    correlationId: string;
  }): Promise<{ draft: Record<string, unknown>; evidenceRefs?: string[] }>;
}

export function createMarketingResearchAdapter(provider: MarketingResearchProvider): CapabilityAdapter {
  return {
    id: "emp003-marketing-research-v1",
    employees: ["EMP-003"],
    capabilities: ["research.web"],
    async execute(request: CapabilityRequest): Promise<CapabilityResult> {
      const input = request.input as { query?: unknown; sourceRefs?: unknown };
      if (typeof input.query !== "string" || !input.query.trim()) {
        return { ok: false, error: { code: "RESEARCH_QUERY_REQUIRED", message: "research.web requires a non-empty query" } };
      }
      const result = await provider.research({
        tenantId: request.context.tenantId,
        query: input.query.trim(),
        sourceRefs: Array.isArray(input.sourceRefs) ? input.sourceRefs.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : undefined,
        correlationId: request.context.correlationId
      });
      if (!Array.isArray(result.sourceRefs) || result.sourceRefs.length === 0) {
        return { ok: false, error: { code: "RESEARCH_EVIDENCE_REQUIRED", message: "Research results require source references" } };
      }
      return { ok: true, output: result, evidence: { sourceRefs: result.sourceRefs } };
    }
  };
}

export function createMarketingContentAdapter(provider: MarketingContentProvider): CapabilityAdapter {
  return {
    id: "emp003-marketing-content-v1",
    employees: ["EMP-003"],
    capabilities: ["content.create"],
    async execute(request: CapabilityRequest): Promise<CapabilityResult> {
      const input = request.input as { brief?: unknown };
      if (!input.brief || typeof input.brief !== "object" || Array.isArray(input.brief)) {
        return { ok: false, error: { code: "CONTENT_BRIEF_REQUIRED", message: "content.create requires a structured brief" } };
      }
      const result = await provider.createDraft({
        tenantId: request.context.tenantId,
        brief: input.brief as Record<string, unknown>,
        correlationId: request.context.correlationId
      });
      return {
        ok: true,
        output: { ...result, status: "DRAFT" },
        evidence: { evidenceRefs: result.evidenceRefs ?? [], publishExecuted: false }
      };
    }
  };
}
