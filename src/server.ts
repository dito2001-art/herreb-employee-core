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
  buildEmployeeSystemPrompt,
  buildTenantReadOnlyRuntime,
  createTenantManifestResolverFromJson,
  HerreBEmployeeRuntime,
  type TenantCapabilityBinding
} from "./runtime";

const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";

type RuntimeEnv = Env & {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  AG002_GATEWAY?: ServiceFetcher;
  HERREB_RUNTIME_TOKEN?: string;
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
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
  TENANT_MANIFESTS_JSON?: string;
  EMP002_TEST_CONSOLE?: string;
};

function readStateString(state: unknown, key: string): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tenantCapabilityBindings(env: RuntimeEnv): TenantCapabilityBinding[] {
  const candidates = [
    [
      env.CRM_CONNECTOR_1_ID,
      env.CRM_CONNECTOR_1,
      env.CRM_CONNECTOR_1_TOKEN,
      env.CRM_CONNECTOR_1_CALENDAR,
      env.CRM_CONNECTOR_1_CALENDAR_TOKEN
    ],
    [
      env.CRM_CONNECTOR_2_ID,
      env.CRM_CONNECTOR_2,
      env.CRM_CONNECTOR_2_TOKEN,
      env.CRM_CONNECTOR_2_CALENDAR,
      env.CRM_CONNECTOR_2_CALENDAR_TOKEN
    ],
    [
      env.CRM_CONNECTOR_3_ID,
      env.CRM_CONNECTOR_3,
      env.CRM_CONNECTOR_3_TOKEN,
      env.CRM_CONNECTOR_3_CALENDAR,
      env.CRM_CONNECTOR_3_CALENDAR_TOKEN
    ]
  ] as const;

  return candidates.flatMap(
    ([connectorId, service, runtimeToken, calendarService, calendarToken]) => {
      const cleanId = connectorId?.trim();
      const cleanToken = runtimeToken?.trim();
      const cleanCalendarToken = calendarToken?.trim();
      return cleanId && service && cleanToken
        ? [
            {
              connectorId: cleanId,
              service,
              runtimeToken: cleanToken,
              calendarService:
                calendarService && cleanCalendarToken
                  ? calendarService
                  : undefined,
              calendarToken:
                calendarService && cleanCalendarToken
                  ? cleanCalendarToken
                  : undefined
            }
          ]
        : [];
    }
  );
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  waitForMcpConnections = true;

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const runtimeEnv = this.env as RuntimeEnv;
    const testConsole = runtimeEnv.EMP002_TEST_CONSOLE === "client0";
    const tenantId =
      readStateString(this.state, "tenantId") ??
      (testConsole ? "herreb-client-0" : undefined);
    const employeeId =
      readStateString(this.state, "employeeId") ??
      (testConsole ? "EMP-002" : undefined);
    const workspaceId =
      readStateString(this.state, "workspaceId") ??
      (testConsole ? "emp002-test-console" : undefined);
    const actorId =
      readStateString(this.state, "actorId") ??
      (testConsole ? "fernando" : undefined);
    const channel = readStateString(this.state, "channel") ?? "web";

    if (!tenantId || !employeeId || !workspaceId || !actorId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "EMPLOYEE_SESSION_IDENTITY_REQUIRED",
          requiredState: ["tenantId", "employeeId", "workspaceId", "actorId"]
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const modelRouter = new StaticModelRouter({
      provider: "workers-ai",
      model: DEFAULT_MODEL,
      reason: "employee-runtime-v0.1 default route"
    });
    const bootstrap = buildTenantReadOnlyRuntime(
      runtimeEnv,
      tenantId,
      tenantCapabilityBindings(runtimeEnv)
    );
    const runtime = new HerreBEmployeeRuntime({
      modelRouter,
      adapters: bootstrap.adapters,
      resolveTenantManifest: createTenantManifestResolverFromJson(
        runtimeEnv.TENANT_MANIFESTS_JSON
      )
    });
    const session = await runtime.start({
      tenantId,
      employeeId,
      workspaceId,
      actorId,
      channel
    });

    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(session.modelRoute.model, {
      sessionAffinity: this.sessionAffinity
    });

    const result = streamText({
      model,
      system: buildEmployeeSystemPrompt(session.context, session.manifest),
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: buildEmployeeTools(session, bootstrap.connectedCapabilities),
      stopWhen: stepCountIs(12),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
