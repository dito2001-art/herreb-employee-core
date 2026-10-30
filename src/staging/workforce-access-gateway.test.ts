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

test("signed RS256 A/B JWTs traverse the gateway binding with tenant identity enforced", async () => {
  const { generateKeyPairSync, createSign } = await import("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const base64url = (value: string) => Buffer.from(value).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const sign = (email: string, audience = "staging-aud") => {
    const header = base64url(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" }));
    const payload = base64url(JSON.stringify({
      iss: "https://staging.cloudflareaccess.com", aud: audience,
      email, iat: now - 10, exp: now + 300
    }));
    const input = header + "." + payload;
    return input + "." + createSign("RSA-SHA256").update(input).sign(privateKey).toString("base64url");
  };
  const originalFetch = globalThis.fetch;
  const received: Array<{ jwt: string | null; forged: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(String(input), "https://staging.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({ keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] });
  }) as typeof fetch;
  try {
    const env = {
      ...ctxEnv,
      INTEGRATED: {
        fetch: async (request: Request) => {
          received.push({
            jwt: request.headers.get("cf-access-jwt-assertion"),
            forged: request.headers.get("x-herreb-internal-tenant-id")
          });
          return Response.json({ ok: true });
        }
      }
    };
    for (const email of ["a@example.test", "b@example.test"]) {
      const jwt = sign(email);
      const result = await gateway.fetch(new Request(base + "/api/emp003/operations", {
        headers: { "cf-access-jwt-assertion": jwt, "x-herreb-internal-tenant-id": "tenant-a" }
      }), env);
      assert.equal(result.status, 200, email);
      assert.equal(received.at(-1)?.jwt, jwt);
      assert.equal(received.at(-1)?.forged, null);
    }
    assert.equal(received.length, 2);
    for (const jwt of [sign("unknown@example.test"), sign("a@example.test", "wrong-audience")]) {
      const result = await gateway.fetch(new Request(base + "/api/emp003/operations", {
        headers: { "cf-access-jwt-assertion": jwt }
      }), env);
      assert.equal(result.status, 401);
    }
    assert.equal(received.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
