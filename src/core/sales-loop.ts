import type {
  ProactiveSalesPolicy,
  SalesChannel,
  SalesLead,
} from "./proactive-sales";
import { canAutonomouslyContactLead } from "./proactive-sales";

export type SalesLoopAction =
  | "DISCOVER"
  | "IMPORT_DATABASE"
  | "QUALIFY"
  | "OUTREACH"
  | "FOLLOWUP"
  | "WAIT"
  | "SUPPRESS";

export interface SalesLoopLead extends SalesLead {
  qualified?: boolean;
  contacted?: boolean;
  followupDue?: boolean;
  touchesToday?: number;
  touchesThisWeek?: number;
}

export interface SalesLoopDecision {
  action: SalesLoopAction;
  leadId?: string;
  channel?: SalesChannel;
  reason: string;
}

function withinTouchLimits(policy: ProactiveSalesPolicy, lead: SalesLoopLead) {
  return (
    (lead.touchesToday ?? 0) < policy.maxTouchesPerLeadPerDay &&
    (lead.touchesThisWeek ?? 0) < policy.maxTouchesPerLeadPerWeek
  );
}

export function nextSalesLoopAction(input: {
  tenantId: string;
  policy: ProactiveSalesPolicy;
  leads: SalesLoopLead[];
}): SalesLoopDecision {
  const { tenantId, policy, leads } = input;

  if (policy.tenantId !== tenantId) {
    return { action: "WAIT", reason: "TENANT_MISMATCH" };
  }
  if (policy.mode === "PAUSED") {
    return { action: "WAIT", reason: "SALES_PAUSED" };
  }

  const optedOut = leads.find(
    (lead) => lead.tenantId === tenantId && lead.optedOut,
  );
  if (optedOut) {
    return { action: "SUPPRESS", leadId: optedOut.id, reason: "LEAD_OPTED_OUT" };
  }

  const unqualified = leads.find(
    (lead) => lead.tenantId === tenantId && !lead.qualified && !lead.optedOut,
  );
  if (unqualified) {
    return { action: "QUALIFY", leadId: unqualified.id, reason: "LEAD_NEEDS_QUALIFICATION" };
  }

  for (const lead of leads) {
    if (lead.tenantId !== tenantId || lead.optedOut || !lead.qualified) continue;
    if (!withinTouchLimits(policy, lead)) continue;

    const kind = lead.contacted ? "FOLLOWUP" : "OUTREACH";
    if (kind === "FOLLOWUP" && !lead.followupDue) continue;

    for (const channel of policy.channels) {
      if (channel === "CRM") continue;
      const decision = canAutonomouslyContactLead({
        policy,
        tenantId,
        lead,
        channel,
        kind,
      });
      if (decision.allowed) {
        return {
          action: kind,
          leadId: lead.id,
          channel,
          reason: decision.reason,
        };
      }
    }
  }

  if (policy.allowDatabaseSelling && leads.length === 0) {
    return { action: "IMPORT_DATABASE", reason: "DATABASE_SELLING_ENABLED" };
  }
  if (policy.allowLeadDiscovery) {
    return { action: "DISCOVER", reason: "LEAD_DISCOVERY_ENABLED" };
  }
  return { action: "WAIT", reason: "NO_ELIGIBLE_SALES_ACTION" };
}
