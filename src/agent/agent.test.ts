import assert from "node:assert/strict";
import test from "node:test";
import { StaticModelRouter } from "../core";
import { createEmployeeAgentSession } from "./session";
import { parseEmployeeSessionState } from "./session-state";

const router = new StaticModelRouter({
  provider: "workers-ai",
  model: "test-model",
  reason: "test"
});

test("request headers resolve a tenant-scoped EMP-002 session", async () => {
  const request = new Request("https://example.test/agents/chat", {
    headers: {
      "X-Tenant-ID": "herreb",
      "X-HerreB-Employee-ID": "EMP-002",
      "X-HerreB-Workspace-ID": "executive",
      "X-HerreB-Actor-ID": "fernando",
      "X-HerreB-Channel": "web",
      "X-Correlation-ID": "corr-002"
    }
  });

  const session = await createEmployeeAgentSession(request, router);
  assert.equal(session.runtime.context.tenantId, "herreb");
  assert.equal(session.runtime.context.employeeId, "EMP-002");
  assert.equal(session.runtime.manifest.id, "EMP-002");
  assert.equal(session.runtime.modelRoute.model, "test-model");
  assert.match(session.systemPrompt, /EMP-002 AI Assistant/);
  assert.match(session.systemPrompt, /Tenant: herreb/);
});

test("unknown employee is rejected before a runtime session starts", async () => {
  const request = new Request("https://example.test/agents/chat", {
    headers: {
      "X-Tenant-ID": "herreb",
      "X-HerreB-Employee-ID": "EMP-004",
      "X-HerreB-Workspace-ID": "executive",
      "X-HerreB-Actor-ID": "fernando"
    }
  });

  await assert.rejects(() => createEmployeeAgentSession(request, router));
});

test("tenant identity is mandatory and cannot silently fall back", async () => {
  const request = new Request("https://example.test/agents/chat", {
    headers: {
      "X-HerreB-Employee-ID": "EMP-001",
      "X-HerreB-Workspace-ID": "sales",
      "X-HerreB-Actor-ID": "fernando"
    }
  });

  await assert.rejects(
    () => createEmployeeAgentSession(request, router),
    /TENANT_ID_REQUIRED/
  );
});

test("persistent session state accepts only the three catalog employees", () => {
  const state = parseEmployeeSessionState({
    tenantId: "herreb",
    employeeId: "EMP-003",
    workspaceId: "marketing",
    actorId: "fernando",
    channel: "web"
  });
  assert.equal(state.employeeId, "EMP-003");
  assert.throws(() =>
    parseEmployeeSessionState({
      tenantId: "herreb",
      employeeId: "EMP-004",
      workspaceId: "other",
      actorId: "fernando",
      channel: "web"
    })
  );
});
