import type { TenantContext } from "./contracts";
import type { DurableDispatcher, DurableJob } from "./durable";
import type { SalesLoopLead } from "./sales-loop";

export interface SalesLeadState extends SalesLoopLead {
  lastActionAt?: string;
  nextFollowupAt?: string;
  lastExecutionKey?: string;
}

export interface SalesStateRepository {
  list(tenantId: string): Promise<SalesLeadState[]>;
  get(tenantId: string, leadId: string): Promise<SalesLeadState | undefined>;
  put(tenantId: string, lead: SalesLeadState): Promise<void>;
}

export function createInMemorySalesStateRepository(): SalesStateRepository {
  const records = new Map<string, SalesLeadState>();
  const key = (tenantId: string, leadId: string) => `${tenantId}:${leadId}`;
  return {
    async list(tenantId) {
      return [...records.values()].filter((lead) => lead.tenantId === tenantId);
    },
    async get(tenantId, leadId) {
      return records.get(key(tenantId, leadId));
    },
    async put(tenantId, lead) {
      if (lead.tenantId !== tenantId) throw new Error("SALES_STATE_TENANT_MISMATCH");
      records.set(key(tenantId, lead.id), { ...lead });
    }
  };
}

export async function markSalesActionExecuted(input: {
  repository: SalesStateRepository;
  tenantId: string;
  lead: SalesLeadState;
  idempotencyKey: string;
  executedAt: string;
  nextFollowupAt?: string;
}): Promise<SalesLeadState> {
  if (input.lead.tenantId !== input.tenantId) {
    throw new Error("SALES_STATE_TENANT_MISMATCH");
  }
  const next: SalesLeadState = {
    ...input.lead,
    contacted: true,
    lastActionAt: input.executedAt,
    lastExecutionKey: input.idempotencyKey,
    ...(input.nextFollowupAt
      ? { followupDue: false, nextFollowupAt: input.nextFollowupAt }
      : {})
  };
  await input.repository.put(input.tenantId, next);
  return next;
}

export async function scheduleSalesFollowup(input: {
  dispatcher: DurableDispatcher;
  context: TenantContext;
  lead: SalesLeadState;
  notBefore: string;
  idempotencyKey: string;
}) {
  if (input.lead.tenantId !== input.context.tenantId) {
    throw new Error("SALES_STATE_TENANT_MISMATCH");
  }
  const job: DurableJob = {
    jobId: `emp001-followup:${input.context.tenantId}:${input.lead.id}`,
    context: input.context,
    capabilityId: "followup.schedule",
    payload: { leadId: input.lead.id, contactKey: input.lead.contactKey },
    idempotencyKey: input.idempotencyKey,
    notBefore: input.notBefore,
    requiresApproval: true
  };
  return input.dispatcher.dispatch(job);
}
