import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import {
  StaticModelRouter,
  parseTenantManifest,
  type EmployeeId
} from "../core";
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
  model: "client0-test",
  reason: "HerreB Client 0 workforce harness"
});

function client0Runtime(
  enabledEmployees: readonly EmployeeId[] = ["EMP-001", "EMP-002", "EMP-003"]
) {
  const calls: Array<{
    service: string;
    method: string;
    tenant: string | null;
  }> = [];
  const bootstrap = buildReadOnlyRuntime({
    SALES_OPS: service((request) => {
      calls.push({
        service: "sales",
        method: request.method,
        tenant: request.headers.get("X-Tenant-ID")
      });
      if (request.method === "GET") {
        return Response.json({
          ok: true,
          products: [
            { id: "consulting", name: "AI Consulting", active: true },
            { id: "workforce", name: "HerreB AI Workforce", active: true }
          ]
        });
      }
      return Response.json({
        ok: true,
        recommendations: [{ id: "workforce", score: 1 }]
      });
    }),
    SALES_OPS_TOKEN: "client0-sales",
    AG002_GATEWAY: service((request) => {
      calls.push({
        service: "crm",
        method: request.method,
        tenant: request.headers.get("X-Tenant-ID")
      });
      return Response.json({ ok: true, data: [{ id: "client0-task" }] });
    }),
    HERREB_RUNTIME_TOKEN: "client0-runtime",
    CALENDAR_READ: service((request) => {
      calls.push({
        service: "calendar",
        method: request.method,
        tenant: request.headers.get("X-Tenant-ID")
      });
      return Response.json({ ok: true, data: [{ id: "client0-event" }] });
    }),
    CALENDAR_READ_TOKEN: "client0-calendar",
    EMAIL_READ: service((request) => {
      calls.push({
        service: "email",
        method: request.method,
        tenant: request.headers.get("X-Tenant-ID")
      });
      return Response.json({ ok: true, data: [{ id: "client0-email" }] });
    }),
    EMAIL_READ_TOKEN: "client0-email"
  });
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: router,
    adapters: bootstrap.adapters,
    resolveTenantManifest: (tenantId) =>
      parseTenantManifest({
        tenantId,
        enabledEmployees: [...enabledEmployees],
        knowledgeNamespace: `${tenantId}:knowledge`,
        offeringNamespace: `${tenantId}:offerings`
      })
  });
  return { runtime, calls, bootstrap };
}

function start(runtime: HerreBEmployeeRuntime, employeeId: EmployeeId) {
  return runtime.start({
    tenantId: "herreb-client-0",
    employeeId,
    workspaceId: employeeId,
    actorId: "fernando",
    channel: "client0-test",
    correlationId: `client0-${employeeId}`
  });
}

test("Client 0 activates exactly the three approved employees together", async () => {
  const { runtime } = client0Runtime();
  const sessions = await Promise.all([
    start(runtime, "EMP-001"),
    start(runtime, "EMP-002"),
    start(runtime, "EMP-003")
  ]);
  assert.deepEqual(
    sessions.map((session) => session.manifest.id),
    ["EMP-001", "EMP-002", "EMP-003"]
  );
  for (const session of sessions) {
    assert.deepEqual(session.tenantManifest?.enabledEmployees, [
      "EMP-001",
      "EMP-002",
      "EMP-003"
    ]);
    assert.equal(session.context.tenantId, "herreb-client-0");
  }
});

test("Client 0 EMP-001 operates standalone with sales and CRM reads but not assistant tools", async () => {
  const { runtime } = client0Runtime(["EMP-001"]);
  const sales = await start(runtime, "EMP-001");
  assert.equal((await sales.execute("offering.read", {})).ok, true);
  assert.equal(
    (await sales.execute("offering.recommend", { need: "growth" })).ok,
    true
  );
  assert.equal(
    (
      await sales.execute("crm.read", {
        operation: "read",
        entity: "companies",
        payload: { limit: 1, offset: 0 }
      })
    ).ok,
    true
  );
  await assert.rejects(
    sales.execute("calendar.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
  await assert.rejects(
    sales.execute("email.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
});

test("Client 0 EMP-002 operates standalone with CRM calendar and email but not offerings", async () => {
  const { runtime } = client0Runtime(["EMP-002"]);
  const assistant = await start(runtime, "EMP-002");
  assert.equal(
    (
      await assistant.execute("crm.read", {
        operation: "read",
        entity: "tasks",
        payload: { completed: false, limit: 1, offset: 0 }
      })
    ).ok,
    true
  );
  assert.equal(
    (await assistant.execute("calendar.read", { operation: "search" })).ok,
    true
  );
  assert.equal(
    (await assistant.execute("email.read", { operation: "search" })).ok,
    true
  );
  await assert.rejects(
    assistant.execute("offering.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
});

test("Client 0 EMP-003 reuses tenant offerings standalone but cannot sell or use assistant tools", async () => {
  const { runtime } = client0Runtime(["EMP-003"]);
  const marketer = await start(runtime, "EMP-003");
  const result = await marketer.execute("offering.read", {});
  assert.equal(result.ok, true);
  const offerings = (
    result.output as { offerings: Array<{ tenantId: string; id: string }> }
  ).offerings;
  assert.deepEqual(
    offerings.map(({ tenantId, id }) => ({ tenantId, id })),
    [
      { tenantId: "herreb-client-0", id: "consulting" },
      { tenantId: "herreb-client-0", id: "workforce" }
    ]
  );
  await assert.rejects(
    marketer.execute("offering.recommend", { need: "growth" }),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
  await assert.rejects(
    marketer.execute("quote.create", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
  await assert.rejects(
    marketer.execute("calendar.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
});

test("Client 0 workforce shares tenant offerings without sharing employee permissions", async () => {
  const { runtime, calls } = client0Runtime();
  const sales = await start(runtime, "EMP-001");
  const assistant = await start(runtime, "EMP-002");
  const marketer = await start(runtime, "EMP-003");

  const salesOfferings = await sales.execute("offering.read", {});
  const marketingOfferings = await marketer.execute("offering.read", {});
  assert.deepEqual(salesOfferings.output, marketingOfferings.output);
  assert.equal(
    (await sales.execute("offering.recommend", { need: "AI growth" })).ok,
    true
  );
  assert.equal(
    (await assistant.execute("calendar.read", { operation: "search" })).ok,
    true
  );
  assert.equal(
    (await assistant.execute("email.read", { operation: "search" })).ok,
    true
  );
  await assert.rejects(
    assistant.execute("offering.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
  await assert.rejects(
    marketer.execute("offering.recommend", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
  await assert.rejects(
    sales.execute("calendar.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );

  assert.equal(calls.length, 5);
  assert.equal(
    calls.every((call) => call.tenant === "herreb-client-0"),
    true
  );
  assert.equal(
    calls.every(
      (call) => call.method === "GET" || call.service === "sales"
    ),
    true
  );
});

test("Client 0 disabled employee fails closed before model or capability execution", async () => {
  const { runtime } = client0Runtime(["EMP-002"]);
  await assert.rejects(start(runtime, "EMP-001"), /EMPLOYEE_NOT_ENTITLED/);
  await assert.rejects(start(runtime, "EMP-003"), /EMPLOYEE_NOT_ENTITLED/);
  assert.equal((await start(runtime, "EMP-002")).manifest.id, "EMP-002");
});
