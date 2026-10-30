import test from "node:test";
import assert from "node:assert/strict";
import gateway from "./workforce-access-gateway";

const base = "https://staging.example.test";
const ctxEnv = {
  STAGING_ACCESS_TEAM_DOMAIN: "staging.cloudflareaccess.com",
  STAGING_ACCESS_AUDIENCE: "staging-aud",
  STAGING_IDENTITY_MAP_JSON: JSON.stringify([
    { email: "a@example.test", actorId: "actor-a", tenantId: "tenant-a", role: "owner" },
    { email: "b@example.test", actorId: "actor-b", tenantId: "tenant-b", role: "user" }
  ]),
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
