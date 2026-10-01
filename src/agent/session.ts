import type { ModelRouter } from "../core";
import {
  buildEmployeeSystemPrompt,
  HerreBEmployeeRuntime,
  type EmployeeRuntimeSession
} from "../runtime";
import {
  resolveEmployeeRequestIdentity,
  type EmployeeRequestDefaults
} from "./request-context";

export interface EmployeeAgentSession {
  runtime: EmployeeRuntimeSession;
  systemPrompt: string;
}

export async function createEmployeeAgentSession(
  request: Request,
  modelRouter: ModelRouter,
  defaults: EmployeeRequestDefaults = {}
): Promise<EmployeeAgentSession> {
  const identity = resolveEmployeeRequestIdentity(request, defaults);
  const runtime = new HerreBEmployeeRuntime({ modelRouter });
  const session = await runtime.start(identity);

  return {
    runtime: session,
    systemPrompt: buildEmployeeSystemPrompt(session.context, session.manifest)
  };
}
