import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { handleEMP003BrowserOperations } from "./emp003-browser-operations";

const tenantId = "herreb-client-0";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const blueprint = {
  tenantId, correlationId: "corr", objective: "Generate B2B demand",
  audiences: ["buyers"], positioning: "reliable", keyMessages: ["value"],
  channels: [{ name: "Email", actions: ["Prepare a draft"] }],
  kpis: [{ metric: "leads", target: "10", measurement: "CRM" }],
  assumptions: [], evidenceRefs: ["https://example.com"],
  status: "DRAFT", publishApproved: false
};
const campaign = () => ({
  campaignId: "campaign-1", blueprint: { ...blueprint }, reviewState: "DRAFT",
  reviewRevision: 1, requiresOwnerReview: true,
  publishAuthorized: false, publishExecuted: false
});
const payload = () => ({ ok: true, tenantId, campaigns: [campaign()] });

async function setup(data: unknown = payload()) {
  const pair = await webcrypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "herreb.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "aud-client-0",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([{ email: "owner@example.com", actorId: "owner", tenantId, role: "owner" }]),
    EMP003_CAMPAIGN_STATE: {
      idFromName: (id: string) => id,
      get: () => ({ fetch: async () => Response.json(data) })
    }
  };
  const fetcher = (async () => Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] })) as typeof fetch;
  const now = Math.floor(Date.now() / 1000);
  const signed = b64({ alg: "RS256", kid: "k1" }) + "." +
    b64({ email: "owner@example.com", iss: "https://herreb.cloudflareaccess.com", aud: "aud-client-0", iat: now - 10, exp: now + 3600 });
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(signed));
  const jwt = signed + "." + Buffer.from(signature).toString("base64url");
  const request = new Request("https://employee.herreb.com/api/emp003/operations", {
    headers: { "cf-access-jwt-assertion": jwt }
  });
  return { env, fetcher, request };
}

test("EMP003 browser operations accept validated tenant-scoped campaigns", async () => {
  const { env, fetcher, request } = await setup();
  const response = await handleEMP003BrowserOperations(request, env, fetcher);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json() as { tenantId: string; campaigns: unknown[] };
  assert.equal(result.tenantId, tenantId);
  assert.equal(result.campaigns.length, 1);
});

test("EMP003 browser operations reject cross-tenant campaigns", async () => {
  const bad = payload();
  bad.campaigns[0].blueprint.tenantId = "another-tenant";
  const { env, fetcher, request } = await setup(bad);
  assert.equal((await handleEMP003BrowserOperations(request, env, fetcher)).status, 503);
});

test("EMP003 browser operations reject duplicate campaign IDs", async () => {
  const bad = payload();
  bad.campaigns.push(campaign());
  const { env, fetcher, request } = await setup(bad);
  assert.equal((await handleEMP003BrowserOperations(request, env, fetcher)).status, 503);
});

test("EMP003 browser operations reject inconsistent review flags", async () => {
  const bad = payload();
  bad.campaigns[0].requiresOwnerReview = false;
  const { env, fetcher, request } = await setup(bad);
  assert.equal((await handleEMP003BrowserOperations(request, env, fetcher)).status, 503);
});

test("EMP003 browser operations reject forged publication authorization", async () => {
  const bad = payload() as unknown as { campaigns: Array<Record<string, unknown>> };
  bad.campaigns[0].publishAuthorized = true;
  const { env, fetcher, request } = await setup(bad);
  assert.equal((await handleEMP003BrowserOperations(request, env, fetcher)).status, 503);
});

test("EMP003 browser operations require signed Access JWT", async () => {
  const { env, fetcher, request } = await setup();
  const unauthorized = new Request(request.url);
  assert.equal((await handleEMP003BrowserOperations(unauthorized, env, fetcher)).status, 401);
});
