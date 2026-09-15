import assert from "node:assert/strict";
import test from "node:test";
import { buildReadOnlyRuntime } from "./bootstrap";
import { HerreBEmployeeRuntime } from "./runtime";
import { StaticModelRouter } from "../core";
import type { ServiceFetcher } from "../adapters";

function service(handler: (request: Request) => Promise<Response> | Response): ServiceFetcher {
  return {
    async fetch(input, init) {
      return handler(new Request(input, init));
    }
  };
}

const router = new StaticModelRouter({ provider: "workers-ai", model: "test", reason: "test" });

test("bootstrap fails closed when bindings or tokens are missing", () => {
  const empty = buildReadOnlyRuntime({});
  assert.equal(empty.adapters.length, 0);
  assert.equal(empty.connectedCapabilities.size, 0);
  assert.equal(empty.diagnostics.salesOps, "MISSING_BINDING");
  assert.equal(empty.diagnostics.crm, "MISSING_BINDING");

  const boundWithoutTokens = buildReadOnlyRuntime({
    SALES_OPS: service(() => new Response("{}")),
    AG002_GATEWAY: service(() => new Response("{}"))
  });
  assert.equal(boundWithoutTokens.adapters.length, 0);
  assert.equal(boundWithoutTokens.diagnostics.salesOps, "MISSING_TOKEN");
  assert.equal(boundWithoutTokens.diagnostics.crm, "MISSING_TOKEN");
});

test("configured bootstrap exposes only read-only capabilities", () => {
  const current = buildReadOnlyRuntime({
    SALES_OPS: service(() => Response.json({ ok: true, products: [] })),
    SALES_OPS_TOKEN: "sales-token",
    AG002_GATEWAY: service(() => Response.json({ ok: true, data: [] })),
    HERREB_RUNTIME_TOKEN: "runtime-token"
  });
  assert.deepEqual(
    [...current.connectedCapabilities].sort(),
    ["crm.read", "offering.read", "offering.recommend"].sort()
  );
  assert.equal(current.diagnostics.salesOps, "CONNECTED");
  assert.equal(current.diagnostics.crm, "CONNECTED");
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
  const runtime = new HerreBEmployeeRuntime({ modelRouter: router, adapters: current.adapters });
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
  assert.equal(observed?.headers.get("X-HerreB-Runtime-Token"), "runtime-token");
  assert.match(observed?.url ?? "", /entity=tasks/);
  assert.match(observed?.url ?? "", /completed=false/);
});
