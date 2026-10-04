import assert from "node:assert/strict";
import test from "node:test";
import { createAg002GatewayControlledWriteTransport, createAg002GatewayReadOnlyTransport } from "./ag002-gateway";
import type { ServiceFetcher } from "./sales-ops";

test("AG-002 transport sends GET read with tenant and runtime auth", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const service: ServiceFetcher = { async fetch(input, init) { captured = { url: String(input), init }; return new Response(JSON.stringify({ ok: true, total: 1 }), { status: 200, headers: { "content-type": "application/json" } }); } };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "secret", tenantId: "herreb" });
  const result = await transport.execute({ tenantId: "herreb", operation: "read", entity: "tasks", payload: { completed: true, limit: 1, offset: 0 }, correlationId: "corr-1" });
  assert.equal(result.ok, true); assert.ok(captured);
  const url = new URL(captured!.url); assert.equal(url.pathname, "/api/agent"); assert.equal(url.searchParams.get("entity"), "tasks"); assert.equal(url.searchParams.get("completed"), "true"); assert.equal(url.searchParams.get("limit"), "1"); assert.equal(captured!.init?.method, "GET");
  const headers = new Headers(captured!.init?.headers); assert.equal(headers.get("X-HerreB-Runtime-Token"), "secret"); assert.equal(headers.get("X-Tenant-ID"), "herreb"); assert.equal(headers.get("X-Correlation-ID"), "corr-1");
  assert.equal(result.evidence?.tenantId, "herreb"); assert.equal(result.evidence?.correlationId, "corr-1"); assert.equal(result.evidence?.operation, "read"); assert.equal(result.evidence?.upstreamStatus, 200); assert.equal(result.evidence?.autoPaginated, false); assert.equal(JSON.stringify(result.evidence).includes("secret"), false);
});

test("AG-002 pending task reads automatically consume all CRM pages", async () => {
  const urls: URL[] = [];
  const service: ServiceFetcher = { async fetch(input) { const url = new URL(String(input)); urls.push(url); const offset = Number(url.searchParams.get("offset")); if (offset === 0) return Response.json({ entity: "tasks", data: Array.from({ length: 100 }, (_, index) => ({ id: index + 1, completed: false })), pagination: { limit: 100, offset: 0, returned: 100, total: 103, hasMore: true, nextOffset: 100 } }); return Response.json({ entity: "tasks", data: [{ id: 101, completed: false }, { id: 102, completed: false }, { id: 103, completed: false }], pagination: { limit: 100, offset: 100, returned: 3, total: 103, hasMore: false, nextOffset: null } }); } };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "secret", tenantId: "herreb-client-0" });
  const result = await transport.execute({ tenantId: "herreb-client-0", operation: "read", entity: "tasks", payload: { completed: false, limit: 50, offset: 0 }, correlationId: "corr-pages" });
  assert.equal(result.ok, true); assert.equal(urls.length, 2); assert.equal(urls[0].searchParams.get("completed"), "false"); assert.equal(urls[0].searchParams.get("limit"), "100"); assert.equal(urls[0].searchParams.get("offset"), "0"); assert.equal(urls[1].searchParams.get("offset"), "100");
  const output = result.output as { data: unknown[]; pagination: Record<string, unknown>; aggregation: Record<string, unknown> }; assert.equal(output.data.length, 103); assert.equal(output.pagination.returned, 103); assert.equal(output.pagination.total, 103); assert.equal(output.pagination.hasMore, false); assert.equal(output.aggregation.autoPaginated, true); assert.equal(output.aggregation.pageCount, 2); assert.equal(result.evidence?.pageCount, 2); assert.equal(result.evidence?.recordsRead, 103);
});

test("AG-002 transport refuses cross-tenant reads before calling service", async () => {
  let calls = 0; const service: ServiceFetcher = { async fetch() { calls += 1; return new Response("{}", { status: 200 }); } };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "secret", tenantId: "herreb" });
  const result = await transport.execute({ tenantId: "another-tenant", operation: "read", entity: "tasks", payload: { limit: 1 }, correlationId: "corr-tenant" });
  assert.equal(result.ok, false); assert.equal(result.error?.code, "AG002_TENANT_SCOPE_MISMATCH"); assert.equal(result.evidence?.executed, false); assert.equal(result.evidence?.operation, "read"); assert.equal(calls, 0);
});

test("AG-002 transport refuses writes before calling service", async () => {
  let calls = 0; const service: ServiceFetcher = { async fetch() { calls += 1; return new Response("{}", { status: 200 }); } };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "secret", tenantId: "herreb" });
  const result = await transport.execute({ tenantId: "herreb", operation: "update", entity: "tasks", payload: { id: 140 }, correlationId: "corr-2" });
  assert.equal(result.ok, false); assert.equal(result.error?.code, "AG002_READ_ONLY"); assert.equal(result.evidence?.operation, "update"); assert.equal(calls, 0);
});

test("AG-002 upstream failures never copy response payload or runtime token into audit evidence", async () => {
  const service: ServiceFetcher = { async fetch() { return Response.json({ access_token: "upstream-access-token", refresh_token: "upstream-refresh-token", privateData: "must-not-enter-audit" }, { status: 502 }); } };
  const transport = createAg002GatewayReadOnlyTransport({ service, runtimeToken: "runtime-secret", tenantId: "herreb-client-0" });
  const result = await transport.execute({ tenantId: "herreb-client-0", operation: "read", entity: "companies", correlationId: "corr-redaction" });
  assert.equal(result.ok, false); assert.equal(result.error?.code, "AG002_UPSTREAM_ERROR"); assert.equal(result.evidence?.upstreamStatus, 502); assert.equal(result.evidence?.operation, "read");
  const evidence = JSON.stringify(result.evidence); assert.equal(evidence.includes("runtime-secret"), false); assert.equal(evidence.includes("upstream-access-token"), false); assert.equal(evidence.includes("upstream-refresh-token"), false); assert.equal(evidence.includes("must-not-enter-audit"), false);
});

test("AG-002 controlled write refuses cross-tenant mutation before service call", async () => {
  let calls = 0; const service: ServiceFetcher = { async fetch() { calls += 1; return Response.json({ ok: true }); } };
  const transport = createAg002GatewayControlledWriteTransport({ service, runtimeToken: "secret", tenantId: "tenant-a" });
  const result = await transport.execute({ tenantId: "tenant-b", operation: "update", entity: "tasks", payload: { id: 140 }, correlationId: "corr-cw-tenant", idempotencyKey: "idem-1" });
  assert.equal(result.ok, false); assert.equal(result.error?.code, "AG002_TENANT_SCOPE_MISMATCH"); assert.equal(result.evidence?.executed, false); assert.equal(calls, 0);
});

test("AG-002 controlled write propagates delete with idempotency and tenant headers", async () => {
  let captured: RequestInit | undefined; const service: ServiceFetcher = { async fetch(_input, init) { captured = init; return Response.json({ ok: true, persisted: true }, { status: 200 }); } };
  const transport = createAg002GatewayControlledWriteTransport({ service, runtimeToken: "secret", tenantId: "tenant-a" });
  const result = await transport.execute({ tenantId: "tenant-a", operation: "delete", entity: "tasks", payload: { id: 140 }, correlationId: "corr-delete", idempotencyKey: "delete-task-140" });
  assert.equal(result.ok, true); assert.equal(captured?.method, "POST"); const headers = new Headers(captured?.headers); assert.equal(headers.get("Idempotency-Key"), "delete-task-140"); assert.equal(headers.get("X-Tenant-ID"), "tenant-a");
  const body = JSON.parse(String(captured?.body)); assert.equal(body.operation, "delete"); assert.equal(body.entity, "tasks"); assert.deepEqual(body.payload, { id: 140 });
});

test("AG-002 controlled write preserves same idempotency key across retry attempts", async () => {
  const keys: string[] = []; let calls = 0; const service: ServiceFetcher = { async fetch(_input, init) { calls += 1; keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? ""); return calls === 1 ? Response.json({ error: "temporary" }, { status: 503 }) : Response.json({ ok: true }, { status: 200 }); } };
  const transport = createAg002GatewayControlledWriteTransport({ service, runtimeToken: "secret", tenantId: "tenant-a" });
  const input = { tenantId: "tenant-a", operation: "update" as const, entity: "tasks", payload: { id: 140, title: "same" }, correlationId: "corr-retry", idempotencyKey: "stable-idem-key" };
  const first = await transport.execute(input); const second = await transport.execute(input);
  assert.equal(first.ok, false); assert.equal(first.error?.retryable, true); assert.equal(second.ok, true); assert.deepEqual(keys, ["stable-idem-key", "stable-idem-key"]);
});

test("AG-002 controlled-write upstream failure does not leak response or token", async () => {
  const service: ServiceFetcher = { async fetch() { return Response.json({ access_token: "leak-me-not", privateData: "sensitive" }, { status: 500 }); } };
  const transport = createAg002GatewayControlledWriteTransport({ service, runtimeToken: "runtime-secret", tenantId: "tenant-a" });
  const result = await transport.execute({ tenantId: "tenant-a", operation: "create", entity: "tasks", payload: { title: "x" }, correlationId: "corr-cw-error", idempotencyKey: "idem-error" });
  assert.equal(result.ok, false); assert.equal(result.error?.code, "AG002_CONTROLLED_WRITE_UPSTREAM_ERROR"); assert.equal(result.error?.retryable, true); assert.equal(result.evidence?.upstreamStatus, 500);
  const serialized = JSON.stringify(result); assert.equal(serialized.includes("runtime-secret"), false); assert.equal(serialized.includes("leak-me-not"), false); assert.equal(serialized.includes("sensitive"), false);
});
