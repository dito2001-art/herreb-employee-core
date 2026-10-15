import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { handleWorkforceAdminGet } from "./workforce-admin-access-read";

const issuer = "https://herreb.cloudflareaccess.com", audience = "aud-client-0";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const state = {
  manifests: [
    { tenantId: "alpha", name: "Alpha", enabledEmployees: ["EMP-001"], knowledgeNamespace: "alpha-k", offeringNamespace: "alpha-o" },
    { tenantId: "beta", name: "Beta", enabledEmployees: ["EMP-002"], knowledgeNamespace: "beta-k", offeringNamespace: "beta-o" }
  ],
  identities: [
    { email: "owner@example.com", actorId: "owner-alpha", tenantId: "alpha", role: "owner" },
    { email: "other@example.com", actorId: "owner-beta", tenantId: "beta", role: "owner" }
  ]
};
async function setup() {
  const pair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "herreb.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: audience,
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify(state.identities),
    WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON: JSON.stringify(["admin@example.com"]),
    WORKFORCE_PLATFORM_ADMIN_TOKEN: "configured-secret-not-sent-to-the-browser",
    WORKFORCE_PLATFORM_ADMIN_ACTOR_ID: "root",
    WORKFORCE_ADMIN_STATE: {
      idFromName: (id: string) => id,
      get: () => ({ fetch: async () => Response.json({ ok: true, state }) })
    }
  };
  let called = "";
  const fetcher = (async (url: RequestInfo | URL) => {
    called = String(url);
    return Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] });
  }) as typeof fetch;
  async function token(email: string, overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const data = b64({ alg: "RS256", kid: "k1" }) + "." + b64({ email, iss: issuer, aud: audience, exp: now + 3600, iat: now - 10, ...overrides });
    const sig = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data));
    return data + "." + Buffer.from(sig).toString("base64url");
  }
  return { env, fetcher, token, called: () => called };
}
test("owner GET yields only its tenant and does not expose raw state", async () => {
  const f = await setup();
  const request = new Request("https://employee.herreb.com/api/admin/workforce?tenantId=beta", { headers: {
    "cf-access-jwt-assertion": await f.token("owner@example.com"),
    "cf-access-authenticated-user-email": "admin@example.com",
    "x-herreb-internal-role": "platform_admin",
    "x-herreb-workforce-platform-token": "spoofed"
  }});
  const response = await handleWorkforceAdminGet(request, f.env, f.fetcher);
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; state?: unknown; snapshot: { tenants: Array<{ tenantId: string }>; totals: { tenants: number } } };
  assert.equal(body.ok, true);
  assert.equal(body.state, undefined);
  assert.deepEqual(body.snapshot.tenants.map(item => item.tenantId), ["alpha"]);
  assert.equal(body.snapshot.totals.tenants, 1);
  assert.equal(JSON.stringify(body).includes("beta"), false);
  assert.equal(f.called(), "https://herreb.cloudflareaccess.com/cdn-cgi/access/certs");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("approved platform admin GET sees all tenants without browser credential", async () => {
  const f = await setup();
  const response = await handleWorkforceAdminGet(new Request("https://employee.herreb.com/api/admin/workforce", { headers: {
    "cf-access-jwt-assertion": await f.token("admin@example.com")
  }}), f.env, f.fetcher);
  assert.equal(response.status, 200);
  const body = await response.json() as { snapshot: { totals: { tenants: number } } };
  assert.equal(body.snapshot.totals.tenants, 2);
});
test("missing JWT, forged email header, wrong audience and tampered signature are denied", async () => {
  const f = await setup();
  const empty = await handleWorkforceAdminGet(new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-authenticated-user-email": "admin@example.com" } }), f.env, f.fetcher);
  assert.equal(empty.status, 401);
  const wrong = await handleWorkforceAdminGet(new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-jwt-assertion": await f.token("owner@example.com", { aud: "wrong" }) } }), f.env, f.fetcher);
  assert.equal(wrong.status, 401);
  const jwt = await f.token("owner@example.com");
  const tampered = jwt.slice(0, -6) + "AAAAAA";
  const invalid = await handleWorkforceAdminGet(new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-jwt-assertion": tampered } }), f.env, f.fetcher);
  assert.equal(invalid.status, 401);
});
test("regular user is denied and no data is returned", async () => {
  const f = await setup();
  f.env.ACCESS_IDENTITY_MAP_JSON = JSON.stringify([{ ...state.identities[0], role: "user" }]);
  const response = await handleWorkforceAdminGet(new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-jwt-assertion": await f.token("owner@example.com") } }), f.env, f.fetcher);
  assert.equal(response.status, 403);
  assert.equal(JSON.stringify(await response.json()).includes("alpha-k"), false);
});
test("missing config and unavailable trusted JWKS fail closed", async () => {
  const f = await setup();
  const jwt = await f.token("owner@example.com");
  const req = new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-jwt-assertion": jwt } });
  assert.equal((await handleWorkforceAdminGet(req, { ...f.env, WORKFORCE_ACCESS_AUDIENCE: undefined }, f.fetcher)).status, 503);
  const failedFetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
  assert.equal((await handleWorkforceAdminGet(req, f.env, failedFetch)).status, 503);
});

test("persisted newly onboarded owner can read only its own tenant", async () => {
  const f = await setup();
  const gamma = { tenantId: "gamma", name: "Gamma", enabledEmployees: ["EMP-001"], knowledgeNamespace: "gamma-k", offeringNamespace: "gamma-o" };
  const dynamicState = {
    manifests: [...state.manifests, gamma],
    identities: [...state.identities, { email: "new@example.com", actorId: "owner-gamma", tenantId: "gamma", role: "owner" }]
  };
  f.env.WORKFORCE_ADMIN_STATE.get = () => ({ fetch: async () => Response.json({ ok: true, state: dynamicState }) });
  const response = await handleWorkforceAdminGet(
    new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-jwt-assertion": await f.token("new@example.com") } }),
    f.env, f.fetcher
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { snapshot: { tenants: Array<{ tenantId: string }>; totals: { identities: number } } };
  assert.deepEqual(body.snapshot.tenants.map(tenant => tenant.tenantId), ["gamma"]);
  assert.equal(JSON.stringify(body).includes("alpha-k"), false);
  assert.equal(JSON.stringify(body).includes("beta-k"), false);
});
test("an identity removed from persisted state is no longer authorized despite stale bootstrap env", async () => {
  const f = await setup();
  f.env.WORKFORCE_ADMIN_STATE.get = () => ({ fetch: async () => Response.json({ ok: true, state: { ...state, identities: [state.identities[1]] } }) });
  const response = await handleWorkforceAdminGet(
    new Request("https://employee.herreb.com/api/admin/workforce", { headers: { "cf-access-jwt-assertion": await f.token("owner@example.com") } }),
    f.env, f.fetcher
  );
  assert.equal(response.status, 401);
});
