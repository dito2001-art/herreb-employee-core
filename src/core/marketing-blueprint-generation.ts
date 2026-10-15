import { createMarketingCampaignBlueprint, type MarketingCampaignBlueprint } from "./marketing-campaign-blueprint";

function extractJsonObject(modelOutput: string): string {
  const cleaned = modelOutput.trim().replace(/^`{3}(?:json)?\s*/i, "").replace(/\s*`{3}$/, "").trim();
  // Accept a JSON object wrapped in harmless prose, but never repair malformed JSON.
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("EMP003_BLUEPRINT_MODEL_JSON_INVALID");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }
  throw new Error("EMP003_BLUEPRINT_MODEL_JSON_INVALID");
}

export function parseGeneratedCampaignBlueprint(input: {
 tenantId: string; correlationId: string; objective: string;
 evidenceRefs: string[]; modelOutput: string;
}): MarketingCampaignBlueprint {
  let data: unknown;
  try {
    data = JSON.parse(extractJsonObject(input.modelOutput));
  } catch (error) {
    if (error instanceof Error && error.message === "EMP003_BLUEPRINT_MODEL_JSON_INVALID") throw error;
    throw new Error("EMP003_BLUEPRINT_MODEL_JSON_INVALID");
  }
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
