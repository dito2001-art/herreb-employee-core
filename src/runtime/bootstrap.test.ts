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
  model: "test",
  reason: "test"
});

test("bootstrap fails closed when bindings or tokens are missing", () => {
  const empty = buildReadOnlyRuntime({});
  assert.equal(empty.adapters.length, 0);
  assert.equal(empty.connectedCapabilities.size, 0);
  assert.deepEqual(empty.diagnostics, {
    salesOps: "MISSING_BINDING",
    crm: "MISSING_BINDING",
    calendar: "MISSING_BINDING",
    email: "MISSING_BINDING"
  });

  const boundWithoutTokens = buildReadOnlyRuntime({
    SALES_OPS: service(() => new Response("{}")),
    AG002_GATEWAY: service(() => new Response("{}")),
    CALENDAR_READ: service(() => new Response("{}")),
    EMAIL_READ: service(() => new Response("{}"))
  });
  assert.equal(boundWithoutTokens.adapters.length, 0);
  assert.deepEqual(boundWithoutTokens.diagnostics, {
    salesOps: "MISSING_TOKEN",
    crm: "MISSING_TOKEN",
    calendar: "MISSING_TOKEN",
    email: "MISSING_TOKEN"
  });
});

test("CRM binding fails closed without an explicit tenant scope", () => {
  const current = buildReadOnlyRuntime({
    AG002_GATEWAY: service(() => Response.json({ ok: true })),
    HERREB_RUNTIME_TOKEN: "runtime-token"
  });
  assert.equal(current.diagnostics.crm, "MISSING_TENANT_SCOPE");
  assert.equal(current.connectedCapabilities.has("crm.read"), false);
});

test("configured bootstrap exposes only read-only capabilities", () => {
  const current = buildReadOnlyRuntime({
    SALES_OPS: service(() => Response.json({ ok: true, products: [] })),
    SALES_OPS_TOKEN: "sales-token",
    AG002_GATEWAY: service(() => Response.json({ ok: true, data: [] })),
    HERREB_RUNTIME_TOKEN: "runtime-token",
    AG002_TENANT_ID: "herreb",
    CALENDAR_READ: service(() => Response.json({ ok: true, data: [] })),
    CALENDAR_READ_TOKEN: "calendar-token",
    EMAIL_READ: service(() => Response.json({ ok: true, data: [] })),
    EMAIL_READ_TOKEN: "email-token"
  });
  assert.deepEqual(
    [...current.connectedCapabilities].sort(),
    [
      "calendar.read",
      "crm.read",
      "email.read",
      "offering.read",
      "offering.recommend"
    ].sort()
  );
  assert.deepEqual(current.diagnostics, {
    salesOps: "CONNECTED",
    crm: "CONNECTED",
    calendar: "CONNECTED",
    email: "CONNECTED"
  });
});

test("EMP-003 can read shared offerings but cannot recommend or sell", async () => {
  const current = buildReadOnlyRuntime({
    SALES_OPS: service(() =>
      Response.json({
        ok: true,
        products: [{ id: "svc-1", name: "AI Consulting", active: true }]
      })
    ),
    SALES_OPS_TOKEN: "sales-token"
  });
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: router,
    adapters: current.adapters
  });
  const session = await runtime.start({
    tenantId: "client-marketing-only",
    employeeId: "EMP-003",
    workspaceId: "marketing",
    actorId: "owner",
    channel: "test"
  });

  const offerings = await session.execute("offering.read", {});
  assert.equal(offerings.ok, true);
  assert.equal(
    (offerings.output as { offerings: Array<{ tenantId: string }> })
      .offerings[0]?.tenantId,
    "client-marketing-only"
  );
  await assert.rejects(
    session.execute("offering.recommend", { need: "growth" }),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
  await assert.rejects(
    session.execute("quote.create", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
});

test("EMP-002 CRM read forwards tenant and correlation evidence through AG-002", async () => {
  let observed: Request | undefined;
  const current = buildReadOnlyRuntime({
    AG002_GATEWAY: service((request) => {
      observed = request;
      return Response.json({ ok: true, data: [{ id: 140 }] });
    }),
    HERREB_RUNTIME_TOKEN: "runtime-token",
    AG002_TENANT_ID: "herreb"
  });
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: router,
    adapters: current.adapters
  });
  const session = await runtime.start({
    tenantId: "herreb",
    employeeId: "EMP-002",
    workspaceId: "executive",
    actorId: "fernando",
    channel: "test",
    correlationId: "corr-bootstrap"
  });
  const result = await session.execute("crm.read", {
    operation: "read",
    entity: "tasks",
    payload: { completed: false, limit: 1, offset: 0 }
  });
  assert.equal(result.ok, true);
  assert.equal(observed?.method, "GET");
  assert.equal(observed?.headers.get("X-Tenant-ID"), "herreb");
  assert.equal(observed?.headers.get("X-Correlation-ID"), "corr-bootstrap");
  assert.equal(
    observed?.headers.get("X-HerreB-Runtime-Token"),
    "runtime-token"
  );
  assert.match(observed?.url ?? "", /entity=tasks/);
  assert.match(observed?.url ?? "", /completed=false/);
});

test("EMP-002 CRM binding rejects another tenant before upstream execution", async () => {
  let calls = 0;
  const current = buildReadOnlyRuntime({
    AG002_GATEWAY: service(() => {
      calls += 1;
      return Response.json({ ok: true });
    }),
    HERREB_RUNTIME_TOKEN: "runtime-token",
    AG002_TENANT_ID: "herreb"
  });
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: router,
    adapters: current.adapters
  });
  const session = await runtime.start({
    tenantId: "client-b",
    employeeId: "EMP-002",
    workspaceId: "executive",
    actorId: "owner",
    channel: "test"
  });
  const result = await session.execute("crm.read", {
    operation: "read",
    entity: "tasks",
    payload: { limit: 1 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AG002_TENANT_SCOPE_MISMATCH");
  assert.equal(calls, 0);
});

test("EMP-002 calendar and email remain GET-only through read-only transports", async () => {
  const methods: string[] = [];
  const current = buildReadOnlyRuntime({
    CALENDAR_READ: service((request) => {
      methods.push(request.method);
      return Response.json({ ok: true, data: [] });
    }),
    CALENDAR_READ_TOKEN: "calendar-token",
    EMAIL_READ: service((request) => {
      methods.push(request.method);
      return Response.json({ ok: true, data: [] });
    }),
    EMAIL_READ_TOKEN: "email-token"
  });
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: router,
    adapters: current.adapters
  });
  const session = await runtime.start({
    tenantId: "herreb",
    employeeId: "EMP-002",
    workspaceId: "executive",
    actorId: "fernando",
    channel: "test",
    correlationId: "corr-emp002-read"
  });

  const calendar = await session.execute("calendar.read", {
    operation: "search",
    timeMin: "2026-09-15T00:00:00-03:00",
    timeMax: "2026-09-16T00:00:00-03:00",
    query: "today"
  });
  const email = await session.execute("email.read", {
    operation: "search",
    query: "invoice"
  });

  assert.equal(calendar.ok, true);
  assert.equal(email.ok, true);
  assert.deepEqual(methods, ["GET", "GET"]);
});
