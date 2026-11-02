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
