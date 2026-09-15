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
  buildReadOnlyRuntimeAdapters,
  HerreBEmployeeRuntime,
  readOnlyCapabilityIds
} from "./runtime";

const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";

type RuntimeEnv = Env & {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  CALENDAR_READ?: ServiceFetcher;
  CALENDAR_READ_TOKEN?: string;
  EMAIL_READ?: ServiceFetcher;
  EMAIL_READ_TOKEN?: string;
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
    const env = this.env as RuntimeEnv;
    const adapters = buildReadOnlyRuntimeAdapters({
      salesOps: env.SALES_OPS,
      salesOpsToken: env.SALES_OPS_TOKEN,
      calendarRead: env.CALENDAR_READ,
      calendarReadToken: env.CALENDAR_READ_TOKEN,
      emailRead: env.EMAIL_READ,
      emailReadToken: env.EMAIL_READ_TOKEN
    });
    const runtime = new HerreBEmployeeRuntime({ modelRouter, adapters });
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
      tools: buildEmployeeTools(session, readOnlyCapabilityIds(adapters)),
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
