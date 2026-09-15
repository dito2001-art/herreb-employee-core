import assert from "node:assert/strict";
import test from "node:test";
import { createAg002GatewayReadOnlyTransport, type ServiceFetcher } from "../adapters";

function serviceWith(handler: (request: Request) => Response | Promise<Response>): ServiceFetcher {
  return {
    async fetch(input, init) {
      return handler(new Request(input, init));
    }
  };
}

test("AG-002 transport rejects writes before any upstream request", async () => {
  let calls = 0;
  const transport = createAg002GatewayReadOnlyTransport({
    service: serviceWith(() => {
      calls += 1;
      return Response.json({ ok: true });
    }),
    runtimeToken: "secret"
  });

  const result = await transport.execute({
    tenantId: "herreb",
    operation: "update",
    entity: "tasks",
    payload: { id: 140, dueDate: "2026-09-16" },
    correlationId: "corr-write"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AG002_READ_ONLY");
  assert.equal(result.evidence?.executed, false);
  assert.equal(calls, 0);
});

test("AG-002 read transport preserves tenant, correlation and scalar filters", async () => {
  let captured: Request | undefined;
  const transport = createAg002GatewayReadOnlyTransport({
    service: serviceWith((request) => {
      captured = request;
      return Response.json({ ok: true, data: [{ id: 140 }] });
    }),
    runtimeToken: "runtime-token"
  });

  const result = await transport.execute({
    tenantId: "herreb",
    operation: "read",
    entity: "tasks",
    payload: { completed: false, limit: 1, nested: { blocked: true } },
    correlationId: "corr-read"
  });

  assert.equal(result.ok, true);
  assert.ok(captured);
  const url = new URL(captured!.url);
  assert.equal(captured!.method, "GET");
  assert.equal(url.pathname, "/api/agent");
  assert.equal(url.searchParams.get("entity"), "tasks");
  assert.equal(url.searchParams.get("completed"), "false");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.has("nested"), false);
  assert.equal(captured!.headers.get("X-HerreB-Runtime-Token"), "runtime-token");
  assert.equal(captured!.headers.get("X-Tenant-ID"), "herreb");
  assert.equal(captured!.headers.get("X-Correlation-ID"), "corr-read");
});
