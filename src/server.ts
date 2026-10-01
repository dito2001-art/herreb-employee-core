import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { ServiceFetcher } from "./adapters";
import { buildEmployeeTools } from "./agent/tools";
import { StaticModelRouter } from "./core";
import {
  accessAgentInstanceSuffix,
  accessIdentityProvenance,
  buildEmployeeSystemPrompt,
  buildTenantReadOnlyRuntime,
  createTenantManifestResolverFromJson,
  HerreBEmployeeRuntime,
  resolveAccessIdentity,
  type TenantCapabilityBinding,
  type VerifiedAccessIdentity
} from "./runtime";

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

type RuntimeEnv = Env & {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  AG002_GATEWAY?: ServiceFetcher;
  RUNTIME_GATEWAY_TOKEN?: string;
  AG002_TENANT_ID?: string;
  CRM_CONNECTOR_1?: ServiceFetcher;
  CRM_CONNECTOR_1_ID?: string;
  CRM_CONNECTOR_1_TOKEN?: string;
  CRM_CONNECTOR_1_CALENDAR?: ServiceFetcher;
  CRM_CONNECTOR_1_CALENDAR_TOKEN?: string;
  CRM_CONNECTOR_2?: ServiceFetcher;
  CRM_CONNECTOR_2_ID?: string;
  CRM_CONNECTOR_2_TOKEN?: string;
  CRM_CONNECTOR_2_CALENDAR?: ServiceFetcher;
  CRM_CONNECTOR_2_CALENDAR_TOKEN?: string;
  CRM_CONNECTOR_3?: ServiceFetcher;
  CRM_CONNECTOR_3_ID?: string;
  CRM_CONNECTOR_3_TOKEN?: string;
  CRM_CONNECTOR_3_CALENDAR?: ServiceFetcher;
  CRM_CONNECTOR_3_CALENDAR_TOKEN?: string;
  TENANT_CRM_CONNECTORS_JSON?: string;
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  CALENDAR_TENANT_ID?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
  TENANT_MANIFESTS_JSON?: string;
  EMP002_TEST_CONSOLE?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
};

function readStateString(state: unknown, key: string): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tenantCapabilityBindings(env: RuntimeEnv): TenantCapabilityBinding[] {
  const candidates = [
    [env.CRM_CONNECTOR_1_ID, env.CRM_CONNECTOR_1, env.CRM_CONNECTOR_1_TOKEN, env.CRM_CONNECTOR_1_CALENDAR, env.CRM_CONNECTOR_1_CALENDAR_TOKEN],
    [env.CRM_CONNECTOR_2_ID, env.CRM_CONNECTOR_2, env.CRM_CONNECTOR_2_TOKEN, env.CRM_CONNECTOR_2_CALENDAR, env.CRM_CONNECTOR_2_CALENDAR_TOKEN],
    [env.CRM_CONNECTOR_3_ID, env.CRM_CONNECTOR_3, env.CRM_CONNECTOR_3_TOKEN, env.CRM_CONNECTOR_3_CALENDAR, env.CRM_CONNECTOR_3_CALENDAR_TOKEN]
  ] as const;

  return candidates.flatMap(([connectorId, service, runtimeToken, calendarService, calendarToken]) => {
    const cleanId = connectorId?.trim();
    const cleanToken = runtimeToken?.trim();
    const cleanCalendarToken = calendarToken?.trim();
    return cleanId && service && cleanToken
      ? [{
          connectorId: cleanId,
          service,
          runtimeToken: cleanToken,
          calendarService: calendarService && cleanCalendarToken ? calendarService : undefined,
          calendarToken: calendarService && cleanCalendarToken ? cleanCalendarToken : undefined
        }]
      : [];
  });
}

export class ChatAgent extends AIChatAgent<Env, Record<string, unknown>, VerifiedAccessIdentity> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  waitForMcpConnections = true;
  private verifiedIdentity?: VerifiedAccessIdentity;

  async onStart(props?: VerifiedAccessIdentity) {
    this.verifiedIdentity = props;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const runtimeEnv = this.env as RuntimeEnv;
    const testConsole = runtimeEnv.EMP002_TEST_CONSOLE === "client0";
    const tenantId = this.verifiedIdentity?.tenantId ?? readStateString(this.state, "tenantId") ?? (testConsole ? "herreb-client-0" : undefined);
    const employeeId = readStateString(this.state, "employeeId") ?? (testConsole ? "EMP-002" : undefined);
    const workspaceId = readStateString(this.state, "workspaceId") ?? (testConsole ? "emp002-test-console" : undefined);
    const actorId = this.verifiedIdentity?.actorId ?? readStateString(this.state, "actorId") ?? (testConsole ? "fernando" : undefined);
    const channel = readStateString(this.state, "channel") ?? "web";

    if (!tenantId || !employeeId || !workspaceId || !actorId) {
      return new Response(JSON.stringify({
        ok: false,
        error: "EMPLOYEE_SESSION_IDENTITY_REQUIRED",
        requiredState: ["tenantId", "employeeId", "workspaceId", "actorId"]
      }), { status: 400, headers: { "content-type": "application/json" } });
    }

    if (this.verifiedIdentity && (this.verifiedIdentity.tenantId !== tenantId || this.verifiedIdentity.actorId !== actorId)) {
      return new Response(JSON.stringify({ ok: false, error: "ACCESS_IDENTITY_CONTEXT_MISMATCH" }), { status: 403, headers: { "content-type": "application/json" } });
    }

    const modelRouter = new StaticModelRouter({
      provider: "workers-ai",
      model: DEFAULT_MODEL,
      reason: "employee-runtime-v0.1 tool-calling route"
    });
    const bootstrap = buildTenantReadOnlyRuntime(runtimeEnv, tenantId, tenantCapabilityBindings(runtimeEnv));
    console.log(JSON.stringify({
      event: "EMP002_RUNTIME_DIAGNOSTIC",
      tenantId,
      calendarDiagnostic: bootstrap.diagnostics.calendar,
      calendarCapabilityConnected: bootstrap.connectedCapabilities.has("calendar.read"),
      crmWriteConnected: bootstrap.connectedCapabilities.has("crm.write"),
      accessIdentityVerified: Boolean(this.verifiedIdentity)
    }));
    const runtime = new HerreBEmployeeRuntime({
      modelRouter,
      adapters: bootstrap.adapters,
      resolveTenantManifest: createTenantManifestResolverFromJson(runtimeEnv.TENANT_MANIFESTS_JSON),
      resolveProvenance: () => this.verifiedIdentity
        ? accessIdentityProvenance(this.verifiedIdentity)
        : { assurance: "UNVERIFIED", source: "missing-cloudflare-access-identity" }
    });
    const session = await runtime.start({ tenantId, employeeId, workspaceId, actorId, channel });

    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(session.modelRoute.model, { sessionAffinity: this.sessionAffinity });
    const nowIso = new Date().toISOString();
    const tenantTimezone = tenantId === "herreb-client-0" ? "America/Asuncion" : "tenant-configured timezone";

    const systemPrompt = `${buildEmployeeSystemPrompt(session.context, session.manifest)}\n\nCURRENT TIME AND TENANT DATE POLICY:\n- Current UTC timestamp: ${nowIso}\n- Tenant timezone for this session: ${tenantTimezone}.\n- Interpret relative dates such as hoy, mañana, ayer, esta semana and business dates in the tenant timezone unless the user explicitly specifies another timezone.\n- Never ask the user to confirm UTC versus the tenant timezone when the tenant timezone is known.\n- For "hoy", calculate the complete local calendar day from 00:00:00 through the start of the next local day; do NOT use a rolling 24-hour interval from the current time.\n- For "mañana", calculate the complete next local calendar day.\n- Never infer today's date from training data or prior conversation dates; derive it from the current timestamp above.\n\nTOOL EXECUTION POLICY:\n- Read-only GREEN capabilities such as calendar.read and crm.read are pre-authorized. Execute them immediately when needed; do not ask the user for permission or confirmation.\n- A direct request from an OWNER_VERIFIED session authorizes the specifically requested YELLOW controlled write. Do not ask the owner for a second confirmation.\n- When the user's request is sufficiently specified (for example "¿Qué tengo hoy?"), call the required tool instead of asking follow-up questions.\n- Never call the same tool more than once in a single user turn.\n- If a tool returns ok=false or an error, stop using tools immediately and answer with the concrete failure.\n- Never retry a failed calendar, CRM, or email call in the same turn.\n- Do not invent idempotencyKey values for read-only operations.\n- For calendar_read, use operation=search to list or find agenda items and operation=availability only for free/busy checks. Never use operation=read/create/update/delete with calendar_read.\n- For calendar questions, make at most one calendar_read call.\n- Do not promise future execution (for example "lo investigaré en unos segundos"). Either execute the tool now or report the current blocking error.\n- Keep operational answers concise. Do not expose internal capability names, policy jargon, UTC conversion details, or implementation details unless the user asks for diagnostics.`;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: buildEmployeeTools(session, bootstrap.connectedCapabilities),
      stopWhen: stepCountIs(3),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

async function authenticatedAgentRequest(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/agents/")) return undefined;
  if (!ctx.access) return new Response("Google sign-in required", { status: 401 });

  const accessIdentity = await ctx.access.getIdentity();
  const email = accessIdentity?.email;
  if (!email) return new Response("Authenticated Google identity has no email", { status: 403 });

  const identity = resolveAccessIdentity(email, env.ACCESS_IDENTITY_MAP_JSON);
  if (!identity) return new Response("Authenticated user is not assigned to a HerreB tenant", { status: 403 });

  const parts = url.pathname.split("/");
  if (parts.length >= 4) {
    const suffix = await accessAgentInstanceSuffix(identity);
    parts[3] = `user-${suffix}`;
    url.pathname = parts.join("/");
  }

  const routedRequest = new Request(url.toString(), request);
  return routeAgentRequest(routedRequest, env, { props: identity });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const agentResponse = await authenticatedAgentRequest(request, env as RuntimeEnv, ctx);
    if (agentResponse) return agentResponse;
    return (await routeAgentRequest(request, env)) || new Response("Not found", { status: 404 });
  }
};
