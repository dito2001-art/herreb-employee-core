import type { MarketingCampaign, MarketingObjective } from "./campaign";
import type { MarketingInsight } from "./marketing";
import { measureCampaign } from "./marketing-handoff";

export type OptimizationRecommendation =
  | "CONTINUE"
  | "REVIEW_UNDERPERFORMANCE"
  | "INSUFFICIENT_EVIDENCE";

export interface CampaignLearning {
  insight: MarketingInsight;
  recommendation: OptimizationRecommendation;
  targetValue: number;
  actualValue: number;
}

export function learnFromCampaign(input: {
  campaign: MarketingCampaign;
  objective: MarketingObjective;
  learnedAt: string;
}): CampaignLearning {
  const { campaign, objective } = input;
  if (campaign.tenantId !== objective.tenantId)
    throw new Error("MARKETING_LEARNING_TENANT_ISOLATION_VIOLATION");
  if (campaign.objectiveId !== objective.id)
    throw new Error("MARKETING_LEARNING_OBJECTIVE_MISMATCH");

  const measurement = measureCampaign(campaign);
  const actualValue = measurement.totals[objective.targetMetric] ?? 0;
  const hasEvidence = measurement.evidenceRefs.length > 0;
  const recommendation: OptimizationRecommendation = !hasEvidence
    ? "INSUFFICIENT_EVIDENCE"
    : actualValue >= objective.targetValue
      ? "CONTINUE"
      : "REVIEW_UNDERPERFORMANCE";
  const confidence = hasEvidence
    ? Math.min(1, measurement.evidenceRefs.length / 3)
    : 0;

  return {
    recommendation,
    targetValue: objective.targetValue,
    actualValue,
    insight: {
      id: `campaign-learning:${campaign.id}:${objective.targetMetric}`,
      tenantId: campaign.tenantId,
      hypothesis: `Campaign ${campaign.id} produced ${actualValue} ${objective.targetMetric} against target ${objective.targetValue}`,
      evidenceRefs: measurement.evidenceRefs,
      confidence,
      learnedAt: input.learnedAt
    }
  };
}
