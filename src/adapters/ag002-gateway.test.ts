import assert from "node:assert/strict";
import test from "node:test";
import { createAg002GatewayReadOnlyTransport } from "./ag002-gateway";
import type { ServiceFetcher } from "./sales-ops";

test("AG-002 transport sends GET read with tenant and runtime auth", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const service: ServiceFetcher = {
    async fetch(input, init) {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ ok: true, total: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "secret" });
  const result = await transport.execute({
    tenantId: "herreb",
    operation: "read",
    entity: "tasks",
    payload: { completed: false, limit: 1, offset: 0 },
    correlationId: "corr-1"
  });

  assert.equal(result.ok, true);
  assert.ok(captured);
  const url = new URL(captured!.url);
  assert.equal(url.pathname, "/api/agent");
  assert.equal(url.searchParams.get("entity"), "tasks");
  assert.equal(url.searchParams.get("completed"), "false");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(captured!.init?.method, "GET");
  const headers = new Headers(captured!.init?.headers);
  assert.equal(headers.get("X-HerreB-Runtime-Token"), "secret");
  assert.equal(headers.get("X-Tenant-ID"), "herreb");
  assert.equal(headers.get("X-Correlation-ID"), "corr-1");
});

test("AG-002 transport refuses writes before calling service", async () => {
  let calls = 0;
  const service: ServiceFetcher = {
    async fetch() {
      calls += 1;
      return new Response("{}", { status: 200 });
    }
  };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "secret" });
  const result = await transport.execute({
    tenantId: "herreb",
    operation: "update",
    entity: "tasks",
    payload: { id: 140 },
    correlationId: "corr-2"
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AG002_READ_ONLY");
  assert.equal(calls, 0);
});
