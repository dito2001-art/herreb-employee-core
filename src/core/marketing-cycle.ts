import { z } from "zod";
import type { TenantContext } from "./contracts";
import type { TenantMarketingBrain } from "./marketing-brain";
import { authorizeCapability, type PolicyDecision } from "./policy";

export const MarketingObjectiveSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  target: z.string().min(1),
  budget: z.number().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  deadline: z.string().min(1).optional()
});
export type MarketingObjective = z.infer<typeof MarketingObjectiveSchema>;

export interface MarketingPlan {
  id: string;
  tenantId: string;
  objectiveId: string;
  offeringIds: string[];
  audienceIds: string[];
  publishableClaimIds: string[];
  proposedActions: string[];
}

export interface MarketingApprovalRequest {
  id: string;
  tenantId: string;
  employeeId: "EMP-003";
  correlationId: string;
  capabilityId: string;
  objectiveId: string;
  planId: string;
  decision: PolicyDecision;
  budget?: number;
  currency?: string;
}

export interface MarketingCycleResult {
  objective: MarketingObjective;
  plan: MarketingPlan;
  approval?: MarketingApprovalRequest;
}

export function runMarketingPlanningCycle(input: {
  context: TenantContext;
  brain: TenantMarketingBrain;
  objective: MarketingObjective;
  executionCapabilityId?: string;
}): MarketingCycleResult {
  const objective = MarketingObjectiveSchema.parse(input.objective);
  if (input.context.employeeId !== "EMP-003") throw new Error("EMP003_REQUIRED");
  if (objective.tenantId !== input.context.tenantId || input.brain.tenantId !== input.context.tenantId) {
    throw new Error("MARKETING_TENANT_ISOLATION_VIOLATION");
  }

  const plan: MarketingPlan = {
    id: `plan:${objective.id}`,
    tenantId: objective.tenantId,
    objectiveId: objective.id,
    offeringIds: input.brain.offerings.filter((item) => item.active).map((item) => item.id),
    audienceIds: input.brain.audiences.map((item) => item.id),
    publishableClaimIds: input.brain.publishableClaims.map((item) => item.id),
    proposedActions: ["content.create", input.executionCapabilityId ?? "campaign.schedule"]
  };

  const capabilityId = input.executionCapabilityId ?? "campaign.schedule";
  const policy = authorizeCapability(input.context, capabilityId);
  if (policy.decision === "DENY") throw new Error("MARKETING_ACTION_DENIED");

  if (policy.decision === "REQUIRE_APPROVAL") {
    return {
      objective,
      plan,
      approval: {
        id: `approval:${input.context.correlationId}:${objective.id}`,
        tenantId: objective.tenantId,
        employeeId: "EMP-003",
        correlationId: input.context.correlationId,
        capabilityId,
        objectiveId: objective.id,
        planId: plan.id,
        decision: policy.decision,
        budget: objective.budget,
        currency: objective.currency
      }
    };
  }

  return { objective, plan };
}
