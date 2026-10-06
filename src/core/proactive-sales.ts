import { z } from "zod";

export const SalesOperatingModeSchema = z.enum(["ACTIVE", "PAUSED"]);
export type SalesOperatingMode = z.infer<typeof SalesOperatingModeSchema>;

export const SalesChannelSchema = z.enum(["WHATSAPP", "EMAIL", "CRM"]);
export type SalesChannel = z.infer<typeof SalesChannelSchema>;

export const ProactiveSalesPolicySchema = z.object({
  tenantId: z.string().min(1),
  mode: SalesOperatingModeSchema.default("ACTIVE"),
  channels: z.array(SalesChannelSchema).default([]),
  allowLeadDiscovery: z.boolean().default(true),
  allowDatabaseSelling: z.boolean().default(true),
  allowAutonomousOutreach: z.boolean().default(true),
  allowAutonomousFollowup: z.boolean().default(true),
  maxTouchesPerLeadPerDay: z.number().int().positive().default(1),
  maxTouchesPerLeadPerWeek: z.number().int().positive().default(3),
  suppressionList: z.array(z.string().min(1)).default([])
});
export type ProactiveSalesPolicy = z.infer<typeof ProactiveSalesPolicySchema>;

export interface SalesLead {
  id: string;
  tenantId: string;
  source: "DISCOVERED" | "DATABASE" | "INBOUND";
  contactKey: string;
  qualified?: boolean;
  optedOut?: boolean;
}

export interface SalesAutonomyDecision {
  allowed: boolean;
  reason:
    | "AUTONOMOUS_SALES_ALLOWED"
    | "SALES_PAUSED"
    | "TENANT_MISMATCH"
    | "CHANNEL_NOT_ENABLED"
    | "AUTONOMOUS_OUTREACH_DISABLED"
    | "AUTONOMOUS_FOLLOWUP_DISABLED"
    | "LEAD_SUPPRESSED"
    | "LEAD_OPTED_OUT";
}

export function canAutonomouslyContactLead(input: {
  policy: ProactiveSalesPolicy;
  tenantId: string;
  lead: SalesLead;
  channel: SalesChannel;
  kind: "OUTREACH" | "FOLLOWUP";
}): SalesAutonomyDecision {
  const policy = ProactiveSalesPolicySchema.parse(input.policy);
  if (
    policy.tenantId !== input.tenantId ||
    input.lead.tenantId !== input.tenantId
  ) {
    return { allowed: false, reason: "TENANT_MISMATCH" };
  }
  if (policy.mode !== "ACTIVE") {
    return { allowed: false, reason: "SALES_PAUSED" };
  }
  if (!policy.channels.includes(input.channel)) {
    return { allowed: false, reason: "CHANNEL_NOT_ENABLED" };
  }
  if (input.lead.optedOut) {
    return { allowed: false, reason: "LEAD_OPTED_OUT" };
  }
  if (policy.suppressionList.includes(input.lead.contactKey)) {
    return { allowed: false, reason: "LEAD_SUPPRESSED" };
  }
  if (input.kind === "OUTREACH" && !policy.allowAutonomousOutreach) {
    return { allowed: false, reason: "AUTONOMOUS_OUTREACH_DISABLED" };
  }
  if (input.kind === "FOLLOWUP" && !policy.allowAutonomousFollowup) {
    return { allowed: false, reason: "AUTONOMOUS_FOLLOWUP_DISABLED" };
  }
  return { allowed: true, reason: "AUTONOMOUS_SALES_ALLOWED" };
}
