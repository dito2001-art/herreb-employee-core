import type { EmployeeManifest, TenantContext } from "../core";
import { buildEmployeeSystemPrompt } from "./prompt";

export interface EMP002ConversationPolicyInput {
  context: TenantContext;
  manifest: EmployeeManifest;
  now?: Date;
  tenantTimezone?: string;
}

/**
 * Channel-neutral EMP-002 policy. Web chat and WhatsApp must use this same
 * policy so behavior, authorization and tool execution do not drift by channel.
 */
export function buildEMP002ConversationSystemPrompt({
  context,
  manifest,
  now = new Date(),
  tenantTimezone = context.tenantId === "herreb-client-0" ? "America/Asuncion" : "tenant-configured timezone"
}: EMP002ConversationPolicyInput): string {
  const nowIso = now.toISOString();

  return `${buildEmployeeSystemPrompt(context, manifest)}\n\nCURRENT TIME AND TENANT DATE POLICY:\n- Current UTC timestamp: ${nowIso}\n- Tenant timezone for this session: ${tenantTimezone}.\n- Interpret relative dates such as hoy, mañana, ayer, esta semana and business dates in the tenant timezone unless the user explicitly specifies another timezone.\n- Never ask the user to confirm UTC versus the tenant timezone when the tenant timezone is known.\n- For "hoy", calculate the complete local calendar day from 00:00:00 through the start of the next local day; do NOT use a rolling 24-hour interval from the current time.\n- For "mañana", calculate the complete next local calendar day.\n- Never infer today's date from training data or prior conversation dates; derive it from the current timestamp above.\n\nTOOL EXECUTION POLICY:\n- Read-only GREEN capabilities such as calendar.read and crm.read are pre-authorized. Execute them immediately when needed; do not ask the user for permission or confirmation.\n- A direct request from an OWNER_VERIFIED session authorizes the specifically requested YELLOW controlled write. Do not ask the owner for a second confirmation.\n- When the user's request is sufficiently specified, call the required tool instead of asking unnecessary follow-up questions.\n- Never call the same tool more than once in a single user turn.\n- If a tool returns ok=false or an error, stop using tools immediately and answer with the concrete failure.\n- Never retry a failed calendar, CRM, or email call in the same turn.\n- Do not invent idempotencyKey values for read-only operations.\n- For calendar_read, use operation=search to list or find agenda items and operation=availability only for free/busy checks. Never use operation=read/create/update/delete with calendar_read.\n- For calendar questions, make at most one calendar_read call.\n- Do not promise future execution. Either execute the tool now or report the current blocking error.\n- Keep operational answers concise. Do not expose internal capability names, policy jargon, UTC conversion details, or implementation details unless the user asks for diagnostics.`;
}
