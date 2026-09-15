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
  createTenantManifestResolverFromJson,
  HerreBEmployeeRuntime
} from "./runtime";

const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";

type RuntimeEnv = Env & {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  AG002_GATEWAY?: ServiceFetcher;
  HERREB_RUNTIME_TOKEN?: string;
  AG002_TENANT_ID?: string;
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
    const bootstrap = buildReadOnlyRuntime(runtimeEnv);
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
    const modelRoute = session.modelRoute;
    const model = createWorkersAI({ binding: this.env.AI })(modelRoute.model);
    const system = buildEmployeeSystemPrompt(session.context, session.manifest);
    const tools = buildEmployeeTools(session, bootstrap.connectedCapabilities);
    const messages = pruneMessages({
      messages: await convertToModelMessages(this.messages),
      reasoning: "all",
      toolCalls: "before-last-2-messages",
      emptyMessages: "remove"
    });

    return streamText({
      model,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(8),
      abortSignal: options?.abortSignal
    }).toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
};
