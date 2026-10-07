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
  buildEMP002ConversationSystemPrompt,
  buildEmployeeSystemPrompt,
  buildTenantReadOnlyRuntime,
  createTenantManifestResolverFromJson,
  HerreBEmployeeRuntime,
  parseRuntimeTenantRegistryManifests,
  resolveAccessIdentityWithRegistry,
  type TenantCapabilityBinding,
  type VerifiedAccessIdentity
} from "./runtime";

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
const EMPLOYEE_HOST = "employee.herreb.com";

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

type AgentProps = VerifiedAccessIdentity & Record<string, unknown>;

function readStateString(state: unknown, key: string): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function identityFromState(state: unknown): VerifiedAccessIdentity | undefined {
  const email = readStateString(state, "accessEmail")?.toLowerCase();
  const tenantId = readStateString(state, "tenantId");
  const actorId = readStateString(state, "actorId");
  const role = readStateString(state, "accessRole");
  if (!email || !tenantId || !actorId || (role !== "owner" && role !== "user")) return undefined;
  return { email, tenantId, actorId, role };
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

export class ChatAgent extends AIChatAgent<Env, Record<string, unknown>, AgentProps> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  waitForMcpConnections = true;
  private verifiedIdentity?: VerifiedAccessIdentity;

  async onStart(props?: AgentProps) {
    if (!props?.email || !props?.tenantId || !props?.actorId || (props.role !== "owner" && props.role !== "user")) return;
    this.verifiedIdentity = {
      email: props.email.trim().toLowerCase(),
      tenantId: props.tenantId.trim(),
      actorId: props.actorId.trim(),
      role: props.role
    };

    this.setState({
      ...this.state,
      accessEmail: this.verifiedIdentity.email,
      accessRole: this.verifiedIdentity.role,
      tenantId: this.verifiedIdentity.tenantId,
      actorId: this.verifiedIdentity.actorId
    });
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const runtimeEnv = this.env as RuntimeEnv;
    const testConsole = runtimeEnv.EMP002_TEST_CONSOLE === "client0";
    const verifiedIdentity = this.verifiedIdentity ?? identityFromState(this.state);
    if (verifiedIdentity) this.verifiedIdentity = verifiedIdentity;

    const tenantId = verifiedIdentity?.tenantId ?? readStateString(this.state, "tenantId") ?? (testConsole ? "herreb-client-0" : undefined);
    const employeeId = readStateString(this.state, "employeeId") ?? (testConsole ? "EMP-002" : undefined);
    const workspaceId = readStateString(this.state, "workspaceId") ?? (testConsole ? "emp002-test-console" : undefined);
    const actorId = verifiedIdentity?.actorId ?? readStateString(this.state, "actorId") ?? (testConsole ? "fernando" : undefined);
    const channel = readStateString(this.state, "channel") ?? "web";

    if (!tenantId || !employeeId || !workspaceId || !actorId) {
      return new Response(JSON.stringify({ ok: false, error: "EMPLOYEE_SESSION_IDENTITY_REQUIRED", requiredState: ["tenantId", "employeeId", "workspaceId", "actorId"] }), { status: 400, headers: { "content-type": "application/json" } });
    }

    if (verifiedIdentity && (verifiedIdentity.tenantId !== tenantId || verifiedIdentity.actorId !== actorId)) {
      return new Response(JSON.stringify({ ok: false, error: "ACCESS_IDENTITY_CONTEXT_MISMATCH" }), { status: 403, headers: { "content-type": "application/json" } });
    }

    const modelRouter = new StaticModelRouter({ provider: "workers-ai", model: DEFAULT_MODEL, reason: "employee-runtime-v0.1 tool-calling route" });
    const bootstrap = buildTenantReadOnlyRuntime(runtimeEnv, tenantId, tenantCapabilityBindings(runtimeEnv));
    console.log(JSON.stringify({ event: "EMP002_RUNTIME_DIAGNOSTIC", tenantId, calendarDiagnostic: bootstrap.diagnostics.calendar, calendarCapabilityConnected: bootstrap.connectedCapabilities.has("calendar.read"), crmWriteConnected: bootstrap.connectedCapabilities.has("crm.write"), accessIdentityVerified: Boolean(verifiedIdentity) }));
    const runtime = new HerreBEmployeeRuntime({
      modelRouter,
      adapters: bootstrap.adapters,
      resolveTenantManifest: createTenantManifestResolverFromJson(runtimeEnv.TENANT_MANIFESTS_JSON),
      resolveProvenance: () => verifiedIdentity ? accessIdentityProvenance(verifiedIdentity) : { assurance: "UNVERIFIED", source: "missing-cloudflare-access-identity" }
    });
    const session = await runtime.start({ tenantId, employeeId, workspaceId, actorId, channel });

    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(session.modelRoute.model, { sessionAffinity: this.sessionAffinity });
    const systemPrompt = session.manifest.id === "EMP-002"
      ? buildEMP002ConversationSystemPrompt({ context: session.context, manifest: session.manifest })
      : buildEmployeeSystemPrompt(session.context, session.manifest);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: pruneMessages({ messages: await convertToModelMessages(this.messages), toolCalls: "before-last-2-messages", reasoning: "before-last-message" }),
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

  let email: string | undefined;
  if (ctx.access) {
    const accessIdentity = await ctx.access.getIdentity();
    email = accessIdentity?.email?.trim().toLowerCase();
  }

  if (!email && url.hostname === EMPLOYEE_HOST) email = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return new Response("Google sign-in required", { status: 401 });

  let identity: VerifiedAccessIdentity | undefined;
  try {
    identity = resolveAccessIdentityWithRegistry(
      email,
      env.ACCESS_IDENTITY_MAP_JSON,
      parseRuntimeTenantRegistryManifests(env.TENANT_MANIFESTS_JSON)
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "ACCESS_TENANT_REGISTRY_REJECTED", email, error: error instanceof Error ? error.message : "UNKNOWN" }));
    return new Response("Authenticated identity failed tenant validation", { status: 403 });
  }
  if (!identity) return new Response("Authenticated user is not assigned to a HerreB tenant", { status: 403 });

  const parts = url.pathname.split("/");
  if (parts.length >= 4) {
    const suffix = await accessAgentInstanceSuffix(identity);
    parts[3] = `user-${suffix}`;
    url.pathname = parts.join("/");
  }

  const routedRequest = new Request(url.toString(), request);
  return (await routeAgentRequest(routedRequest, env, { props: identity as AgentProps })) ?? undefined;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const agentResponse = await authenticatedAgentRequest(request, env as RuntimeEnv, ctx);
    if (agentResponse) return agentResponse;
    return (await routeAgentRequest(request, env)) || new Response("Not found", { status: 404 });
  }
};
