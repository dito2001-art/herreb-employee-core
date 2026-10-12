import type { MarketingResearchProvider } from "./emp003-marketing";

export interface GroundedMarketingBrief {
  topic: string;
  objective: string;
  findings: Array<{ url: string; excerpt: string }>;
  sourceRefs: string[];
  status: "RESEARCHED_DRAFT_INPUT";
  publishApproved: false;
}

/** Turns tenant-scoped web research into an explicitly unapproved draft input. */
export async function buildGroundedMarketingBrief(
  provider: MarketingResearchProvider,
  input: { tenantId: string; correlationId: string; topic: string; objective: string; sourceRefs: string[] }
): Promise<GroundedMarketingBrief> {
  if (!input.tenantId.trim() || !input.correlationId.trim() || !input.topic.trim() || !input.objective.trim()) {
    throw new Error("EMP003_GROUNDED_BRIEF_INPUT_REQUIRED");
  }
  const result = await provider.research({
    tenantId: input.tenantId, correlationId: input.correlationId,
    query: input.topic, sourceRefs: input.sourceRefs
  });
  if (!result.sourceRefs.length || !result.findings.length) throw new Error("EMP003_GROUNDED_BRIEF_EVIDENCE_REQUIRED");
  const allowed = new Set(result.sourceRefs);
  const findings = result.findings.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { url?: unknown; content?: unknown };
    if (typeof record.url !== "string" || !allowed.has(record.url) || typeof record.content !== "string" || !record.content.trim()) return [];
    return [{ url: record.url, excerpt: record.content.slice(0, 2500) }];
  });
  if (!findings.length) throw new Error("EMP003_GROUNDED_BRIEF_EVIDENCE_REQUIRED");
  return {
    topic: input.topic, objective: input.objective, findings,
    sourceRefs: [...new Set(findings.map((finding) => finding.url))],
    status: "RESEARCHED_DRAFT_INPUT", publishApproved: false
  };
}
