import { createMarketingCampaignBlueprint, type MarketingCampaignBlueprint } from "./marketing-campaign-blueprint";

export function parseGeneratedCampaignBlueprint(input: {
 tenantId: string; correlationId: string; objective: string;
 evidenceRefs: string[]; modelOutput: string;
}): MarketingCampaignBlueprint {
  let data: unknown;
  try {
    const cleaned = input.modelOutput.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
    data = JSON.parse(cleaned);
  } catch { throw new Error("EMP003_BLUEPRINT_MODEL_JSON_INVALID"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("EMP003_BLUEPRINT_MODEL_SHAPE_INVALID");
  const record = data as Record<string, unknown>;
  return createMarketingCampaignBlueprint({
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    objective: input.objective,
    audiences: Array.isArray(record.audiences) ? record.audiences as string[] : [],
    positioning: typeof record.positioning === "string" ? record.positioning : "",
    keyMessages: Array.isArray(record.keyMessages) ? record.keyMessages as string[] : [],
    channels: Array.isArray(record.channels) ? record.channels as Array<{ name: string; actions: string[] }> : [],
    kpis: Array.isArray(record.kpis) ? record.kpis as Array<{ metric: string; target: string; measurement: string }> : [],
    assumptions: Array.isArray(record.assumptions) ? record.assumptions as string[] : [],
    evidenceRefs: input.evidenceRefs
  });
}
