import type { AdapterRegistry, CapabilityResult } from "./adapters";
import type { TenantContext } from "./contracts";
import { executeCapability, type ExecuteOptions } from "./executor";
import type { ProactiveSalesPolicy, SalesChannel } from "./proactive-sales";
import {
  nextSalesLoopAction,
  type SalesLoopAction,
  type SalesLoopDecision,
  type SalesLoopLead
} from "./sales-loop";

export interface SalesLoopExecutionStore {
  has(idempotencyKey: string): Promise<boolean>;
  record(result: SalesLoopExecutionResult): Promise<void>;
}

export interface SalesLoopSafePorts {
  discoverLeads?(tenantId: string): Promise<CapabilityResult>;
  importDatabaseLeads?(tenantId: string): Promise<CapabilityResult>;
  qualifyLead?(lead: SalesLoopLead): Promise<CapabilityResult>;
  suppressLead?(lead: SalesLoopLead): Promise<CapabilityResult>;
}

export interface SalesLoopExecutionResult {
  decision: SalesLoopDecision;
  executed: boolean;
  idempotencyKey?: string;
  capabilityId?: string;
  result?: CapabilityResult;
  reason: string;
}

export interface ExecuteSalesLoopInput {
  context: TenantContext;
  policy: ProactiveSalesPolicy;
  leads: SalesLoopLead[];
  registry: AdapterRegistry;
  store: SalesLoopExecutionStore;
  safePorts?: SalesLoopSafePorts;
  executeOptions?: ExecuteOptions;
}

function idempotencyKey(
  context: TenantContext,
  decision: SalesLoopDecision
): string | undefined {
  if (!decision.leadId) return undefined;
  return [
    "emp001",
    context.tenantId,
    decision.action.toLowerCase(),
    decision.leadId,
    decision.channel?.toLowerCase() ?? "internal"
  ].join(":");
}

function capabilityFor(
  action: SalesLoopAction,
  channel?: SalesChannel
): string | undefined {
  if (action === "OUTREACH") {
    return channel === "WHATSAPP" ? "whatsapp.send" : "sales.outreach";
  }
  if (action === "FOLLOWUP") return "followup.schedule";
  return undefined;
}

function findLead(
  leads: SalesLoopLead[],
  leadId?: string
): SalesLoopLead | undefined {
  return leadId ? leads.find((lead) => lead.id === leadId) : undefined;
}

export async function executeNextSalesLoopAction(
  input: ExecuteSalesLoopInput
): Promise<SalesLoopExecutionResult> {
  const decision = nextSalesLoopAction({
    tenantId: input.context.tenantId,
    policy: input.policy,
    leads: input.leads
  });
  const key = idempotencyKey(input.context, decision);

  if (key && (await input.store.has(key))) {
    return {
      decision,
      executed: false,
      idempotencyKey: key,
      reason: "DUPLICATE_SUPPRESSED"
    };
  }

  const lead = findLead(input.leads, decision.leadId);
  let result: CapabilityResult | undefined;
  let capabilityId = capabilityFor(decision.action, decision.channel);

  switch (decision.action) {
    case "WAIT":
      return { decision, executed: false, reason: decision.reason };
    case "DISCOVER":
      if (!input.safePorts?.discoverLeads) {
        return {
          decision,
          executed: false,
          reason: "DISCOVERY_PORT_NOT_CONFIGURED"
        };
      }
      result = await input.safePorts.discoverLeads(input.context.tenantId);
      break;
    case "IMPORT_DATABASE":
      if (!input.safePorts?.importDatabaseLeads) {
        return {
          decision,
          executed: false,
          reason: "DATABASE_PORT_NOT_CONFIGURED"
        };
      }
      result = await input.safePorts.importDatabaseLeads(
        input.context.tenantId
      );
      break;
    case "QUALIFY":
      if (!lead || !input.safePorts?.qualifyLead) {
        return {
          decision,
          executed: false,
          reason: "QUALIFICATION_PORT_NOT_CONFIGURED"
        };
      }
      result = await input.safePorts.qualifyLead(lead);
      break;
    case "SUPPRESS":
      if (!lead || !input.safePorts?.suppressLead) {
        return {
          decision,
          executed: false,
          reason: "SUPPRESSION_PORT_NOT_CONFIGURED"
        };
      }
      result = await input.safePorts.suppressLead(lead);
      break;
    case "OUTREACH":
    case "FOLLOWUP": {
      if (!lead || !capabilityId || !key) {
        return {
          decision,
          executed: false,
          reason: "INVALID_CONTACT_DECISION"
        };
      }
      const execution = await executeCapability(
        input.registry,
        {
          context: input.context,
          capabilityId,
          input: {
            leadId: lead.id,
            contactKey: lead.contactKey,
            channel: decision.channel,
            kind: decision.action
          },
          idempotencyKey: key
        },
        input.executeOptions
      );
      result = execution;
      break;
    }
  }

  const executionResult: SalesLoopExecutionResult = {
    decision,
    executed: result?.ok === true,
    ...(key ? { idempotencyKey: key } : {}),
    ...(capabilityId ? { capabilityId } : {}),
    result,
    reason: result?.ok
      ? "EXECUTED"
      : (result?.error?.code ?? "EXECUTION_FAILED")
  };

  if (key && result?.ok) await input.store.record(executionResult);
  return executionResult;
}

export function createInMemorySalesLoopExecutionStore(): SalesLoopExecutionStore {
  const completed = new Set<string>();
  return {
    async has(key) {
      return completed.has(key);
    },
    async record(result) {
      if (result.idempotencyKey) completed.add(result.idempotencyKey);
    }
  };
}
