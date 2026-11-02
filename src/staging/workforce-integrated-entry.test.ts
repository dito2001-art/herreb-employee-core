import test from "node:test";
import assert from "node:assert/strict";
import ingress from "./workforce-integrated-entry";

const ctx = {} as ExecutionContext;
const empty = {} as Parameters<typeof ingress.fetch>[1];
const request = (
  path: string,
  method = "GET",
  headers: Record<string, string> = {}
) => new Request("https://staging.example.test" + path, { method, headers });
const call = (
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
  env = empty
) => ingress.fetch(request(path, method, headers), env, ctx);

test("internal, admin, webhook and websocket entrypoints are denied before authentication", async () => {
  for (const path of [
    "/api/internal/emp003/review",
    "/api/internal/emp002/e2e",
    "/api/admin/workforce",
    "/webhooks/meta/whatsapp",
    "/agents/ChatAgent/x",
    "/oauth/callback",
    "/cdn-cgi/preview",
    "/api/unknown"
  ]) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal(
    (await call("/api/emp003/operations", "GET", { upgrade: "websocket" }))
      .status,
    403
  );
});
test("every allowed browser endpoint requires dedicated staging configuration", async () => {
  for (const [path, method] of [
    ["/api/emp001/operations", "GET"],
    ["/api/emp002/calendar", "POST"],
    ["/api/emp003/operations", "GET"],
    ["/api/emp003/review", "POST"],
    ["/api/emp003/drafts", "GET"],
    ["/api/emp003/generate-campaign", "POST"],
    ["/", "GET"],
    ["/index.html", "GET"],
    ["/assets/app.js", "GET"]
  ])
    assert.equal((await call(path, method)).status, 503, path);
});
test("unexpected methods and static paths fail closed", async () => {
  for (const [path, method] of [
    ["/api/emp001/operations", "POST"],
    ["/api/emp002/calendar", "GET"],
    ["/api/emp003/operations", "POST"],
    ["/api/emp003/generate-campaign", "GET"],
    ["/favicon.ico", "GET"],
    ["/assets/private%2Ffile", "GET"],
    ["/assets/.hidden", "GET"],
    ["/assets/app..js", "GET"],
    ["/assets/app.js/", "GET"]
  ])
    assert.equal((await call(path, method)).status, 404, path);
});
test("forged email headers and tenant selectors never authorize access", async () => {
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    WORKFORCE_CORE: { fetch: async () => new Response(null, { status: 401 }) }
  } as unknown as typeof empty;
  for (const path of [
    "/api/emp001/operations?tenantId=tenant-b",
    "/api/emp002/calendar",
    "/api/emp003/operations",
    "/"
  ]) {
    const method = path === "/api/emp002/calendar" ? "POST" : "GET";
    const res = await call(
      path,
      method,
      { "cf-access-authenticated-user-email": "a@example.test" },
      env
    );
    assert.equal(res.status, 401, path);
  }
});

test("staging config never trusts a forged Access email or an unsigned JWT", async () => {
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    WORKFORCE_CORE: { fetch: async () => new Response(null, { status: 401 }) }
  } as unknown as typeof empty;
  for (const email of ["a@example.test", "b@example.test"]) {
    const res = await call(
      "/api/emp003/operations",
      "GET",
      {
        "cf-access-authenticated-user-email": email,
        "cf-access-jwt-assertion": "unsigned.jwt.payload"
      },
      env
    );
    assert.equal(res.status, 401);
  }
});

test("copy allowlist is exact for all lifecycle methods", async () => {
  for (const suffix of [
    "",
    "/content",
    "/context",
    "/status",
    "/approval",
    "/brand-brain"
  ]) {
    assert.equal((await call("/api/emp003/assets" + suffix)).status, 503);
    assert.equal(
      (await call("/api/emp003/assets" + suffix, "POST")).status,
      404
    );
  }
  for (const suffix of ["/generate", "/edit", "/approve"]) {
    assert.equal(
      (await call("/api/emp003/assets" + suffix, "POST")).status,
      503
    );
    assert.equal((await call("/api/emp003/assets" + suffix)).status, 404);
  }
  for (const suffix of [
    "/unknown",
    "/content/extra",
    "/edit/",
    "/tenant-b",
    "/%65dit"
  ]) {
    assert.equal(
      (await call("/api/emp003/assets" + suffix, "POST")).status,
      404
    );
  }
});


test("integrated entry independently rejects disabled C employee before Durable Objects", async () => {
  let coreCalls = 0;
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    WORKFORCE_CORE: { fetch: async (request: Request) => {
      coreCalls++;
      assert.equal(new URL(request.url).pathname, "/api/internal/workforce/resolve-actor");
      assert.equal(request.headers.get("cf-access-jwt-assertion"), "tenant-c-jwt");
      return Response.json({ ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-001"] });
    } }
  } as unknown as typeof empty;
  const response = await call("/api/emp003/operations", "GET", {
    "cf-access-jwt-assertion": "tenant-c-jwt",
    "x-herreb-internal-tenant-id": "tenant-a"
  }, env);
  assert.equal(response.status, 403);
  assert.equal(coreCalls, 1);
});

test("integrated entry fails closed when Core cannot resolve a revoked actor", async () => {
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    WORKFORCE_CORE: { fetch: async () => new Response(null, { status: 403 }) }
  } as unknown as typeof empty;
  assert.equal((await call("/api/emp001/operations", "GET", {
    "cf-access-jwt-assertion": "revoked-jwt"
  }, env)).status, 401);
});

test("Core-authorized EMP-001 reaches the actual handler without legacy identity lookup", async () => {
  let coreCalls = 0;
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    STAGING_DO_BOUNDARY_KEY: "test-only-boundary-key-longer-than-32-bytes",
    WORKFORCE_CORE: { fetch: async () => {
      coreCalls++;
      return Response.json({ ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-001"] });
    } }
  } as unknown as typeof empty;
  const response = await call("/api/emp001/operations", "GET", {
    "cf-access-jwt-assertion": "core-authorized-c"
  }, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, "SALES_NOT_CONFIGURED");
  assert.equal(coreCalls, 1);
});

test("Core-authorized EMP-002 reaches calendar handler without legacy identity lookup", async () => {
  let coreCalls = 0;
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    STAGING_DO_BOUNDARY_KEY: "test-only-boundary-key-longer-than-32-bytes",
    WORKFORCE_CORE: { fetch: async () => {
      coreCalls++;
      return Response.json({ ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-002"] });
    } }
  } as unknown as typeof empty;
  const response = await call("/api/emp002/calendar", "POST", {
    "cf-access-jwt-assertion": "core-authorized-c",
    "content-type": "application/json"
  }, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, "NATIVE_CALENDAR_UNAVAILABLE");
  assert.equal(coreCalls, 1);
});

test("Core-authorized EMP-003 reaches marketing handler without legacy identity lookup", async () => {
  let coreCalls = 0;
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    STAGING_DO_BOUNDARY_KEY: "test-only-boundary-key-longer-than-32-bytes",
    WORKFORCE_CORE: { fetch: async () => {
      coreCalls++;
      return Response.json({ ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-003"] });
    } }
  } as unknown as typeof empty;
  const response = await call("/api/emp003/operations", "GET", {
    "cf-access-jwt-assertion": "core-authorized-c"
  }, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  assert.equal(coreCalls, 1);
});

test("Core-authorized tenant C reads only its Sales Ops products through integrated entry", async () => {
  let upstreamCalls = 0;
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    STAGING_DO_BOUNDARY_KEY: "test-only-boundary-key-longer-than-32-bytes",
    SALES_OPS_TOKEN: "isolated-test-token",
    SALES_OPS_TENANT_ID: "tenant-c",
    SALES_OPS: { fetch: async (request: Request) => {
      upstreamCalls++;
      assert.equal(new URL(request.url).pathname, "/api/v1/products");
      assert.equal(request.headers.get("x-tenant-id"), "tenant-c");
      return Response.json({ ok: true, tenant_id: "tenant-c", products: [
        { tenant_id: "tenant-c", sku: "SKU-C", name: "C product", price_gs: 100, stock_qty: 3 }
      ] });
    } },
    WORKFORCE_CORE: { fetch: async () => Response.json({
      ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-001"]
    }) }
  } as unknown as typeof empty;
  const response = await call("/api/emp001/operations", "GET", {
    "cf-access-jwt-assertion": "core-authorized-c"
  }, env);
  assert.equal(response.status, 200, await response.clone().text());
  const payload = await response.json() as { tenantId: string; products: Array<{ sku: string }> };
  assert.equal(payload.tenantId, "tenant-c");
  assert.equal(payload.products[0]?.sku, "SKU-C");
  assert.equal(upstreamCalls, 1);
});

test("Core-authorized tenant C reads its EMP-003 campaigns through scoped Durable Object", async () => {
  const calls: string[] = [];
  const id = { toString: () => "tenant-c-object" };
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    STAGING_DO_BOUNDARY_KEY: "test-only-boundary-key-longer-than-32-bytes",
    EMP003_CAMPAIGN_STATE: {
      idFromName: (name: string) => { calls.push("id:" + name); return id; },
      get: () => ({ fetch: async (request: Request) => {
        calls.push("fetch:" + new URL(request.url).searchParams.get("tenantId"));
        assert.ok(request.headers.has("x-workforce-do-capability"));
        return Response.json({ tenantId: "tenant-c", campaigns: [] });
      } })
    },
    WORKFORCE_CORE: { fetch: async () => Response.json({
      ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-003"]
    }) }
  } as unknown as typeof empty;
  const response = await call("/api/emp003/operations", "GET", {
    "cf-access-jwt-assertion": "core-authorized-c"
  }, env);
  assert.equal(response.status, 200, await response.clone().text());
  const payload = await response.json() as { tenantId: string; campaigns: unknown[] };
  assert.equal(payload.tenantId, "tenant-c");
  assert.deepEqual(payload.campaigns, []);
  assert.ok(calls.includes("fetch:tenant-c"));
  assert.ok(!calls.some((x) => x.includes("tenant-a")));
});

test("Core-authorized tenant C lists only its native EMP-002 calendar entries", async () => {
  const id = { toString: () => "calendar-tenant-c-object" };
  const calls: string[] = [];
  const env = {
    STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE: "staging-only-aud",
    STAGING_DO_BOUNDARY_KEY: "test-only-boundary-key-longer-than-32-bytes",
    EMP002_OPERATIONS: {
      idFromName: (name: string) => { calls.push("id:" + name); return id; },
      get: () => ({ fetch: async (request: Request) => {
        assert.ok(request.headers.has("x-workforce-do-capability"));
        assert.equal(request.headers.get("x-herreb-internal-tenant-id"), "tenant-c");
        const body = await request.json() as { operation: string };
        assert.equal(body.operation, "list");
        calls.push("list");
        return Response.json({ ok: true, entries: [] });
      } })
    },
    WORKFORCE_CORE: { fetch: async () => Response.json({
      ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-002"]
    }) }
  } as unknown as typeof empty;
  const response = await ingress.fetch(new Request("https://staging.example.test/api/emp002/calendar", {
    method: "POST",
    headers: { "cf-access-jwt-assertion": "core-authorized-c", "content-type": "application/json" },
    body: JSON.stringify({ operation: "list" })
  }), env, ctx);
  assert.equal(response.status, 200, await response.clone().text());
  const payload = await response.json() as { tenantId: string; entries: unknown[] };
  assert.equal(payload.tenantId, "tenant-c");
  assert.deepEqual(payload.entries, []);
  assert.ok(calls.includes("id:tenant:tenant-c"));
  assert.ok(calls.includes("list"));
  assert.ok(!calls.some(x => x.includes("tenant-a")));
});
