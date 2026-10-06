import type { AdapterRegistry } from "./adapters";
import type { TenantContext } from "./contracts";
import type { DurableDispatcher } from "./durable";
import type { ExecuteOptions } from "./executor";
import type { ProactiveSalesPolicy } from "./proactive-sales";
import {
  executeNextSalesLoopAction,
  type SalesLoopExecutionResult,
  type SalesLoopExecutionStore,
  type SalesLoopSafePorts
} from "./sales-loop-executor";
import {
  markSalesActionExecuted,
  scheduleSalesFollowup,
  type SalesLeadState,
  type SalesStateRepository
} from "./sales-state";

export interface ExecuteSalesCycleInput {
  context: TenantContext;
  policy: ProactiveSalesPolicy;
  registry: AdapterRegistry;
  executionStore: SalesLoopExecutionStore;
  stateRepository: SalesStateRepository;
  safePorts?: SalesLoopSafePorts;
  executeOptions?: ExecuteOptions;
  dispatcher?: DurableDispatcher;
  now?: string;
  followupAt?: string;
}

export interface SalesCycleResult {
  execution: SalesLoopExecutionResult;
  persistedLead?: SalesLeadState;
  followupScheduled?: boolean;
  followupReason?: string;
}

export async function executeSalesCycle(
  input: ExecuteSalesCycleInput
): Promise<SalesCycleResult> {
  const leads = await input.stateRepository.list(input.context.tenantId);
  const execution = await executeNextSalesLoopAction({
    context: input.context,
    policy: input.policy,
    leads,
    registry: input.registry,
    store: input.executionStore,
    ...(input.safePorts ? { safePorts: input.safePorts } : {}),
    ...(input.executeOptions ? { executeOptions: input.executeOptions } : {})
  });

  if (!execution.executed || !execution.decision.leadId) {
    return { execution };
  }

  const lead = await input.stateRepository.get(
    input.context.tenantId,
    execution.decision.leadId
  );
  if (!lead) return { execution };

  const persistedLead = await markSalesActionExecuted({
    repository: input.stateRepository,
    tenantId: input.context.tenantId,
    lead,
    idempotencyKey:
      execution.idempotencyKey ??
      `emp001:${input.context.tenantId}:${execution.decision.action.toLowerCase()}:${lead.id}`,
    executedAt: input.now ?? new Date().toISOString(),
    ...(input.followupAt ? { nextFollowupAt: input.followupAt } : {})
  });

  if (
    execution.decision.action !== "OUTREACH" ||
    !input.followupAt ||
    !input.dispatcher
  ) {
    return { execution, persistedLead };
  }

  const followup = await scheduleSalesFollowup({
    dispatcher: input.dispatcher,
    context: input.context,
    lead: persistedLead,
    notBefore: input.followupAt,
    idempotencyKey: `emp001:${input.context.tenantId}:followup:${lead.id}`
  });

  return {
    execution,
    persistedLead,
    followupScheduled: followup.accepted,
    followupReason: followup.reason
  };
}
