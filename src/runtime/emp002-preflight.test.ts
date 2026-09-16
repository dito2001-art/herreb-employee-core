import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import { StaticModelRouter } from "../core";
import { buildReadOnlyRuntime } from "./bootstrap";
import { HerreBEmployeeRuntime } from "./runtime";

function service(
  handler: (request: Request) => Promise<Response> | Response
): ServiceFetcher {
  return {
    async fetch(input, init) {
      return handler(new Request(input, init));
    }
  };
}

const router = new StaticModelRouter({
  provider: "workers-ai",
  model: "preflight-test",
  reason: "EMP-002 preflight"
});

function runtimeFor(tenantId = "herreb-client-0") {
  const requests: Request[] = [];
  const upstream = service((request) => {
    requests.push(request);
    return Response.json({ ok: true, data: [] });
  });
  const bootstrap = buildReadOnlyRuntime({
    AG002_GATEWAY: upstream,
    HERREB_RUNTIME_TOKEN: "crm-token",
    AG002_TENANT_ID: "herreb-client-0",
    CALENDAR_READ: upstream,
    CALENDAR_READ_TOKEN: "calendar-token",
    CALENDAR_TENANT_ID: "herreb-client-0",
    EMAIL_READ: upstream,
    EMAIL_READ_TOKEN: "email-token",
    EMAIL_TENANT_ID: "herreb-client-0"
  });
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: router,
    adapters: bootstrap.adapters
  });
  return {
    requests,
    session: runtime.start({
      tenantId,
      employeeId: "EMP-002",
      workspaceId: "preflight",
      actorId: "owner",
      channel: "test",
      correlationId: "corr-preflight-002"
    })
  };
}

test("EMP-002 read-only preflight propagates tenant and correlation on every upstream read", async () => {
  const { requests, session } = runtimeFor();
  const assistant = await session;
  assert.equal(
    (
      await assistant.execute("crm.read", {
        operation: "read",
        entity: "companies",
        payload: { limit: 1, offset: 0 }
      })
    ).ok,
    true
  );
  const calendar = await assistant.execute("calendar.read", {
    operation: "search",
    timeMin: "2026-09-15T00:00:00-03:00",
    timeMax: "2026-09-16T00:00:00-03:00"
  });
  const email = await assistant.execute("email.read", {
    operation: "search",
    query: "HerreB",
    maxResults: 1
  });
  assert.equal(calendar.ok, true);
  assert.equal(email.ok, true);
  assert.equal(calendar.evidence?.tenantId, "herreb-client-0");
  assert.equal(calendar.evidence?.correlationId, "corr-preflight-002");
  assert.equal(email.evidence?.tenantId, "herreb-client-0");
  assert.equal(email.evidence?.correlationId, "corr-preflight-002");
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("X-Tenant-ID"), "herreb-client-0");
    assert.equal(request.headers.get("X-Correlation-ID"), "corr-preflight-002");
  }
});

test("EMP-002 read capability cannot be turned into Calendar or Email write", async () => {
  const { requests, session } = runtimeFor();
  const assistant = await session;
  await assert.rejects(
    assistant.execute("calendar.read", {
      operation: "create",
      title: "forbidden",
      startTime: "2026-09-16T10:00:00-03:00",
      endTime: "2026-09-16T11:00:00-03:00",
      timezone: "America/Asuncion"
    }),
    /CALENDAR_OPERATION_MISMATCH/
  );
  await assert.rejects(
    assistant.execute("email.read", {
      operation: "send",
      to: ["test@example.com"],
      subject: "forbidden",
      body: "forbidden"
    }),
    /EMAIL_OPERATION_MISMATCH/
  );
  assert.equal(requests.length, 0);
});

test("wrong tenant cannot cross CRM Calendar or Email Client0 boundaries", async () => {
  const { requests, session } = runtimeFor("client-b");
  const assistant = await session;
  const crm = await assistant.execute("crm.read", {
    operation: "read",
    entity: "companies",
    payload: { limit: 1 }
  });
  const calendar = await assistant.execute("calendar.read", {
    operation: "search",
    timeMin: "2026-09-15T00:00:00-03:00",
    timeMax: "2026-09-16T00:00:00-03:00"
  });
  const email = await assistant.execute("email.read", {
    operation: "search",
    query: "HerreB",
    maxResults: 1
  });
  assert.equal(crm.ok, false);
  assert.equal(crm.error?.code, "AG002_TENANT_SCOPE_MISMATCH");
  assert.equal(calendar.ok, false);
  assert.equal(calendar.error?.code, "READ_ONLY_TENANT_SCOPE_MISMATCH");
  assert.equal(email.ok, false);
  assert.equal(email.error?.code, "READ_ONLY_TENANT_SCOPE_MISMATCH");
  assert.equal(requests.length, 0);
});

test("Calendar and Email are not connected without explicit tenant scope", () => {
  const upstream = service(() => Response.json({ ok: true }));
  const bootstrap = buildReadOnlyRuntime({
    CALENDAR_READ: upstream,
    CALENDAR_READ_TOKEN: "calendar-token",
    EMAIL_READ: upstream,
    EMAIL_READ_TOKEN: "email-token"
  });
  assert.equal(bootstrap.diagnostics.calendar, "MISSING_TENANT_SCOPE");
  assert.equal(bootstrap.diagnostics.email, "MISSING_TENANT_SCOPE");
  assert.equal(bootstrap.connectedCapabilities.has("calendar.read"), false);
  assert.equal(bootstrap.connectedCapabilities.has("email.read"), false);
});
