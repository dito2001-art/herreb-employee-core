import test from "node:test";
import assert from "node:assert/strict";
import gateway from "./workforce-access-gateway";

const base = "https://staging.example.test";
const ctxEnv = {
  STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
  STAGING_ACCESS_AUDIENCE: "staging-aud",
  WORKFORCE_CORE: { fetch: async (request: Request) => {
    const jwt = request.headers.get("cf-access-jwt-assertion");
    if (!jwt || jwt === "unsigned.jwt.payload") return new Response(null, { status: 401 });
    return Response.json({ ok: true, actorId: "actor-a", tenantId: "tenant-a", role: "owner", enabledEmployees: ["EMP-003"] });
  } },
  INTEGRATED: { fetch: async () => Response.json({ ok: true }) }
};
const call = (path: string, method = "GET", headers: Record<string, string> = {}) =>
  gateway.fetch(new Request(base + path, { method, headers }), ctxEnv);

test("gateway denies unknown routes and unsupported methods before auth", async () => {
  for (const path of ["/api/admin/workforce", "/api/internal/emp002/e2e", "/webhooks/meta/whatsapp", "/api/unknown"])
    assert.equal((await call(path)).status, 404, path);
  assert.equal((await call("/api/emp002/calendar", "GET")).status, 404);
  assert.equal((await call("/api/emp003/assets/edit", "GET")).status, 404);
  assert.equal((await call("/api/emp003/assets/%65dit", "POST")).status, 404);
});

test("gateway denies unsigned JWT and spoofed identity for both A and B", async () => {
  for (const email of ["a@example.test", "b@example.test"]) {
    const response = await call("/api/emp003/operations?tenantId=tenant-a", "GET", {
      "cf-access-authenticated-user-email": email,
      "cf-access-jwt-assertion": "unsigned.jwt.payload",
      "x-herreb-internal-tenant-id": "tenant-a"
    });
    assert.equal(response.status, 401);
  }
});

test("gateway denies missing JWT, cross-site POST and websocket upgrade", async () => {
  assert.equal((await call("/api/emp003/operations")).status, 401);
  assert.equal((await call("/api/emp002/calendar", "POST", { origin: "https://evil.test" })).status, 403);
  assert.equal((await call("/api/emp003/operations", "GET", { upgrade: "websocket" })).status, 403);
});

test("gateway requires isolated binding and Access configuration", async () => {
  const response = await gateway.fetch(new Request(base + "/api/emp003/operations"), {
    ...ctxEnv, INTEGRATED: undefined
  } as unknown as typeof ctxEnv);
  assert.equal(response.status, 503);
});

test("gateway preserves independently Core-resolved A/B/C identity and denies revoked actors", async () => {
  const tenants = new Map([
    ["jwt-a", { actorId: "actor-a", tenantId: "tenant-a", role: "owner", enabledEmployees: ["EMP-003"] }],
    ["jwt-b", { actorId: "actor-b", tenantId: "tenant-b", role: "user", enabledEmployees: ["EMP-003"] }],
    ["jwt-c", { actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-001"] }]
  ]);
  const forwarded: Array<{ jwt: string | null; forged: string | null }> = [];
  const env = {
    ...ctxEnv,
    WORKFORCE_CORE: { fetch: async (request: Request) => {
      const jwt = request.headers.get("cf-access-jwt-assertion") ?? "";
      const actor = tenants.get(jwt);
      return actor ? Response.json({ ok: true, ...actor }) : new Response(null, { status: 403 });
    } },
    INTEGRATED: { fetch: async (request: Request) => {
      forwarded.push({
        jwt: request.headers.get("cf-access-jwt-assertion"),
        forged: request.headers.get("x-herreb-internal-tenant-id")
      });
      return Response.json({ ok: true });
    } }
  };
  for (const jwt of ["jwt-a", "jwt-b"]) {
    const result = await gateway.fetch(new Request(base + "/api/emp003/operations", {
      headers: { "cf-access-jwt-assertion": jwt, "x-herreb-internal-tenant-id": "tenant-other" }
    }), env);
    assert.equal(result.status, 200, jwt);
  }
  assert.deepEqual(forwarded.map(x => x.jwt), ["jwt-a", "jwt-b"]);
  assert.ok(forwarded.every(x => x.forged === null));
  const disabled = await gateway.fetch(new Request(base + "/api/emp003/operations", {
    headers: { "cf-access-jwt-assertion": "jwt-c" }
  }), env);
  assert.equal(disabled.status, 403);
  const revoked = await gateway.fetch(new Request(base + "/api/emp003/operations", {
    headers: { "cf-access-jwt-assertion": "jwt-revoked" }
  }), env);
  assert.equal(revoked.status, 401);
  assert.equal(forwarded.length, 2);
});

test("Core entitlements deny disabled employee before integrated binding", async () => {
  let called = false;
  const response = await gateway.fetch(new Request(base + "/api/emp003/operations", {
    headers: { "cf-access-jwt-assertion": "valid-jwt" }
  }), {
    ...ctxEnv,
    WORKFORCE_CORE: { fetch: async () => Response.json({
      ok: true, actorId: "actor-c", tenantId: "tenant-c", role: "owner", enabledEmployees: ["EMP-001"]
    }) },
    INTEGRATED: { fetch: async () => { called = true; return Response.json({ ok: true }); } }
  });
  assert.equal(response.status, 403);
  assert.equal(called, false);
});
