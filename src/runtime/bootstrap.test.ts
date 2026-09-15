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

test("configured bootstrap exposes only read-only capabilities", () => {
  const current = buildReadOnlyRuntime({
    SALES_OPS: service(() => Response.json({ ok: true, products: [] })),
    SALES_OPS_TOKEN: "sales-token",
    AG002_GATEWAY: service(() => Response.json({ ok: true, data: [] })),
    HERREB_RUNTIME_TOKEN: "runtime-token",
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

test("EMP-002 CRM read forwards tenant and correlation evidence through AG-002", async () => {
  let observed: Request | undefined;
  const current = buildReadOnlyRuntime({
    AG002_GATEWAY: service((request) => {
      observed = request;
      return Response.json({ ok: true, data: [{ id: 140 }] });
    }),
    HERREB_RUNTIME_TOKEN: "runtime-token"
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
