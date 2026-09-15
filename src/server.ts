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
  buildReadOnlyRuntime,
  createTenantCrmRegistry,
  createTenantManifestResolverFromJson,
  HerreBEmployeeRuntime,
  resolveTenantCrm,
  type TenantCrmBinding
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
  CRM_CONNECTOR_2?: ServiceFetcher;
  CRM_CONNECTOR_2_ID?: string;
  CRM_CONNECTOR_2_TOKEN?: string;
  CRM_CONNECTOR_3?: ServiceFetcher;
  CRM_CONNECTOR_3_ID?: string;
  CRM_CONNECTOR_3_TOKEN?: string;
  TENANT_CRM_CONNECTORS_JSON?: string;
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
  TENANT_MANIFESTS_JSON?: string;
};

function readStateString(state: unknown, key: string): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tenantCrmBindings(env: RuntimeEnv): TenantCrmBinding[] {
  const candidates = [
    [env.CRM_CONNECTOR_1_ID, env.CRM_CONNECTOR_1, env.CRM_CONNECTOR_1_TOKEN],
    [env.CRM_CONNECTOR_2_ID, env.CRM_CONNECTOR_2, env.CRM_CONNECTOR_2_TOKEN],
    [env.CRM_CONNECTOR_3_ID, env.CRM_CONNECTOR_3, env.CRM_CONNECTOR_3_TOKEN]
  ] as const;

  return candidates.flatMap(([connectorId, service, runtimeToken]) => {
    const cleanId = connectorId?.trim();
    const cleanToken = runtimeToken?.trim();
    return cleanId && service && cleanToken
      ? [{ connectorId: cleanId, service, runtimeToken: cleanToken }]
      : [];
  });
}

function runtimeForTenant(env: RuntimeEnv, tenantId: string) {
  const registry = createTenantCrmRegistry(env.TENANT_CRM_CONNECTORS_JSON);
  const resolved = resolveTenantCrm(tenantId, registry, tenantCrmBindings(env));

  return buildReadOnlyRuntime({
    SALES_OPS: env.SALES_OPS,
    SALES_OPS_TOKEN: env.SALES_OPS_TOKEN,
    AG002_GATEWAY: resolved?.binding.service ?? env.AG002_GATEWAY,
    HERREB_RUNTIME_TOKEN:
      resolved?.binding.runtimeToken ?? env.HERREB_RUNTIME_TOKEN,
    AG002_TENANT_ID: resolved ? tenantId : env.AG002_TENANT_ID,
    CALENDAR_READ: env.CALENDAR_READ,
    CALENDAR_READ_TOKEN: env.CALENDAR_READ_TOKEN,
    EMAIL_READ: env.EMAIL_READ,
    EMAIL_READ_TOKEN: env.EMAIL_READ_TOKEN
  });
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  waitForMcpConnections = true;

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const tenantId = readStateString(this.state, "tenantId");
    const employeeId = readStateString(this.state, "employeeId");
    const workspaceId = readStateString(this.state, "workspaceId");
    const actorId = readStateString(this.state, "actorId");
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
    const runtimeEnv = this.env as RuntimeEnv;
    const bootstrap = runtimeForTenant(runtimeEnv, tenantId);
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
