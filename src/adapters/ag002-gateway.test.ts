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
  const transport = createAg002GatewayReadOnlyTransport({
    service,
    runtimeToken: "secret",
    tenantId: "herreb"
  });
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
  assert.equal(result.evidence?.tenantId, "herreb");
  assert.equal(result.evidence?.correlationId, "corr-1");
  assert.equal(result.evidence?.operation, "read");
  assert.equal(result.evidence?.upstreamStatus, 200);
  assert.equal(JSON.stringify(result.evidence).includes("secret"), false);
});

test("AG-002 transport refuses cross-tenant reads before calling service", async () => {
  let calls = 0;
  const service: ServiceFetcher = {
    async fetch() {
      calls += 1;
      return new Response("{}", { status: 200 });
    }
  };
  const transport = createAg002GatewayReadOnlyTransport({
    service,
    runtimeToken: "secret",
    tenantId: "herreb"
  });
  const result = await transport.execute({
    tenantId: "another-tenant",
    operation: "read",
    entity: "tasks",
    payload: { limit: 1 },
    correlationId: "corr-tenant"
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AG002_TENANT_SCOPE_MISMATCH");
  assert.equal(result.evidence?.executed, false);
  assert.equal(result.evidence?.operation, "read");
  assert.equal(calls, 0);
});

test("AG-002 transport refuses writes before calling service", async () => {
  let calls = 0;
  const service: ServiceFetcher = {
    async fetch() {
      calls += 1;
      return new Response("{}", { status: 200 });
    }
  };
  const transport = createAg002GatewayReadOnlyTransport({
    service,
    runtimeToken: "secret",
    tenantId: "herreb"
  });
  const result = await transport.execute({
    tenantId: "herreb",
    operation: "update",
    entity: "tasks",
    payload: { id: 140 },
    correlationId: "corr-2"
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AG002_READ_ONLY");
  assert.equal(result.evidence?.operation, "update");
  assert.equal(calls, 0);
});

test("AG-002 upstream failures never copy response payload or runtime token into audit evidence", async () => {
  const service: ServiceFetcher = {
    async fetch() {
      return Response.json(
        {
          access_token: "upstream-access-token",
          refresh_token: "upstream-refresh-token",
          privateData: "must-not-enter-audit"
        },
        { status: 502 }
      );
    }
  };
  const transport = createAg002GatewayReadOnlyTransport({
    service,
    runtimeToken: "runtime-secret",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    operation: "read",
    entity: "companies",
    correlationId: "corr-redaction"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AG002_UPSTREAM_ERROR");
  assert.equal(result.evidence?.upstreamStatus, 502);
  assert.equal(result.evidence?.operation, "read");
  const evidence = JSON.stringify(result.evidence);
  assert.equal(evidence.includes("runtime-secret"), false);
  assert.equal(evidence.includes("upstream-access-token"), false);
  assert.equal(evidence.includes("upstream-refresh-token"), false);
  assert.equal(evidence.includes("must-not-enter-audit"), false);
});
