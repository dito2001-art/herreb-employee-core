import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { request as httpRequest } from "node:http";

const base = process.env.WF00_WORKERD_URL ?? "http://127.0.0.1:8791";
const tenant = "wf00-" + randomUUID().replaceAll("-", "").slice(0, 12);
const campaignId = "campaign-" + randomUUID().replaceAll("-", "").slice(0, 12);
const blueprint = (objective: string) => ({
  tenantId: tenant,
  correlationId: "corr-" + objective,
  objective,
  audiences: ["B2B"],
  positioning: "Helpful",
  keyMessages: ["Fast"],
  channels: [{ name: "Email", actions: ["Draft"] }],
  kpis: [{ metric: "Leads", target: "TBD", measurement: "CRM" }],
  assumptions: [],
  evidenceRefs: ["https://developers.cloudflare.com/"],
  status: "DRAFT",
  publishApproved: false
});
const endpoint = (suffix = "") =>
  `${base}/fixture/draft?tenantId=${tenant}&campaignId=${campaignId}${suffix}`;
async function write(objective: string, suffix: string) {
  const response = await fetch(endpoint(suffix), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(blueprint(objective))
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}
async function read() {
  const response = await fetch(endpoint());
  assert.equal(response.status, 200);
  return response.json() as Promise<Record<string, any>>;
}
const missingCAS = await write("without-cas", "");
assert.equal(missingCAS.status, 428, JSON.stringify(missingCAS));
assert.equal(missingCAS.body.error, "EMP003_DRAFT_REVISION_REQUIRED");
assert.equal((await read()).found, false, "rejected write must not persist");
const ambiguousCAS = await write(
  "ambiguous",
  "&createOnly=1&expectedRevision=1"
);
assert.equal(ambiguousCAS.status, 428, JSON.stringify(ambiguousCAS));
assert.equal((await read()).found, false, "ambiguous write must not persist");
console.log(
  "WORKERD_DO_NEGATIVE_PASS: real DO POST missing/ambiguous CAS returns 428 without persistence"
);

const m2mPost = (payload: Record<string, unknown>) =>
  fetch(base + "/fixture/m2m-drafts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-herreb-workforce-admin-token": "wf00-local-only-token"
    },
    body: JSON.stringify(payload)
  });
const foreignCampaign =
  "cross-" + randomUUID().replaceAll("-", "").slice(0, 12);
const foreign = await m2mPost({
  tenantId: "tenant-a",
  campaignId: foreignCampaign,
  createOnly: true,
  blueprint: { ...blueprint("cross-tenant"), tenantId: "tenant-b" }
});
assert.equal(foreign.status, 403, await foreign.text());
assert.equal(
  (
    (await (
      await fetch(
        `${base}/fixture/draft?tenantId=tenant-a&campaignId=${foreignCampaign}`
      )
    ).json()) as { found: boolean }
  ).found,
  false
);
console.log(
  "WORKERD_M2M_NEGATIVE_PASS: real Worker POST cross-tenant returns 403 without persistence"
);

const initial = await write("initial", "&createOnly=1");
assert.equal(initial.status, 200, JSON.stringify(initial));
assert.equal(initial.body.revision, 1);
assert.equal((await read()).campaign.objective, "initial");
const duplicate = await write("duplicate", "&createOnly=1");
assert.equal(duplicate.status, 409);
const [first, second] = await Promise.all([
  write("first", "&expectedRevision=1"),
  write("second", "&expectedRevision=1")
]);
assert.deepEqual([first.status, second.status].sort(), [200, 409]);
const accepted = first.status === 200 ? "first" : "second";
const persisted = await read();
assert.equal(persisted.revision, 2);
assert.equal(persisted.campaign.objective, accepted);
assert.equal((await write("stale", "&expectedRevision=1")).status, 409);
assert.equal((await read()).campaign.objective, accepted);
const transition = {
  tenantId: tenant,
  campaignId,
  correlationId: "review-1",
  actorId: "owner",
  actorRole: "owner",
  from: "DRAFT",
  to: "IN_REVIEW",
  reason: "Review",
  idempotencyKey: "review-1"
};
const transitionUrl = `${base}/fixture/transition?tenantId=${tenant}&campaignId=${campaignId}`;
const review = await fetch(transitionUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(transition)
});
assert.equal(review.status, 200, await review.text());
assert.notEqual((await write("blocked", "&expectedRevision=2")).status, 200);
assert.equal((await read()).campaign.objective, accepted);
console.log(
  "WORKERD_DO_PASS: create, duplicate, concurrent CAS, stale revision, readback, reviewed immutable"
);

const stagingRequest = async (path: string, init?: RequestInit) =>
  fetch(base + "/staging" + path, init);
for (const path of [
  "/api/internal/emp003/drafts",
  "/api/emp001/operations",
  "/api/emp002/calendar",
  "/agents/ChatAgent/tenant",
  "/cdn-cgi/preview",
  "/api/admin/workforce",
  "/webhooks/meta/whatsapp",
  "/api/emp003/operations/extra"
]) {
  assert.equal((await stagingRequest(path)).status, 404, path);
}
assert.equal((await stagingRequest("/api/emp003/operations")).status, 503);
assert.equal(
  (
    await stagingRequest("/api/emp003/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    })
  ).status,
  503
);
const websocketStatus = await new Promise<number>((resolve, reject) => {
  const req = httpRequest(
    base + "/staging/api/emp003/operations",
    {
      headers: { upgrade: "websocket", connection: "Upgrade" }
    },
    (response) => {
      resolve(response.statusCode ?? 0);
      response.resume();
    }
  );
  req.on("upgrade", () =>
    reject(new Error("STAGING_WEBSOCKET_UPGRADE_ACCEPTED"))
  );
  req.on("error", reject);
  req.end();
});
assert.equal(websocketStatus, 403);
console.log(
  "WORKERD_STAGING_NEGATIVE_PASS: routes, missing Access config, WebSocket"
);

const pair = await webcrypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  },
  true,
  ["sign", "verify"]
);
const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
const jwks = JSON.stringify({
  keys: [{ ...publicJwk, kid: "wf00-key", alg: "RS256", use: "sig" }]
});
const identities = JSON.stringify([
  {
    email: "tenant-a@example.invalid",
    actorId: "owner-a",
    tenantId: "tenant-a",
    role: "owner"
  },
  {
    email: "tenant-b@example.invalid",
    actorId: "owner-b",
    tenantId: "tenant-b",
    role: "owner"
  }
]);
const enc = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const sign = async (claims: Record<string, unknown>) => {
  const data = enc({ alg: "RS256", kid: "wf00-key" }) + "." + enc(claims);
  const sig = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(data)
  );
  return data + "." + Buffer.from(sig).toString("base64url");
};
const claims = (email: string) => ({
  iss: "https://wf00-test.cloudflareaccess.com",
  aud: "wf00-test-audience",
  iat: now - 10,
  exp: now + 600,
  email
});
const authRequest = (
  token?: string,
  path = "/index.html",
  init?: RequestInit
) =>
  stagingRequest("/fixture-auth" + path, {
    ...init,
    headers: {
      "x-fixture-jwks": jwks,
      "x-fixture-identities": identities,
      ...(token ? { "cf-access-jwt-assertion": token } : {}),
      ...(init?.headers ?? {})
    }
  });
const validA = await sign(claims("tenant-a@example.invalid"));
const validB = await sign(claims("tenant-b@example.invalid"));
assert.equal((await authRequest()).status, 401, "missing JWT");
assert.equal(
  (
    await authRequest(
      await sign({
        ...claims("tenant-a@example.invalid"),
        iss: "https://wrong.cloudflareaccess.com"
      })
    )
  ).status,
  401,
  "issuer"
);
assert.equal(
  (
    await authRequest(
      await sign({ ...claims("tenant-a@example.invalid"), aud: "wrong" })
    )
  ).status,
  401,
  "audience"
);
assert.equal(
  (
    await authRequest(
      await sign({ ...claims("tenant-a@example.invalid"), exp: now - 1 })
    )
  ).status,
  401,
  "expiry"
);
assert.equal(
  (await authRequest(validA.slice(0, -3) + "bad")).status,
  401,
  "signature"
);
assert.equal(
  (await authRequest(validA)).status,
  503,
  "valid JWT reaches missing test-only ASSETS"
);
assert.equal(
  (await authRequest(validB)).status,
  503,
  "tenant B JWT resolves independently"
);
assert.equal(
  (await authRequest(validA, "/api/internal/emp003/drafts")).status,
  404,
  "internal route denied even with valid JWT"
);
const draftRequest = (token: string, tenantId: string, id: string) =>
  authRequest(token, "/api/emp003/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      campaignId: id,
      blueprint: { ...blueprint("auth"), tenantId }
    })
  });
const campaignA = "jwt-" + randomUUID().replaceAll("-", "").slice(0, 12);
const writeA = await draftRequest(validA, "tenant-a", campaignA);
assert.equal(writeA.status, 200, await writeA.text());
assert.equal(
  (await draftRequest(validB, "tenant-a", campaignA)).status,
  403,
  "tenant B cannot write tenant A"
);
const campaignB = "jwt-" + randomUUID().replaceAll("-", "").slice(0, 12);
const writeB = await draftRequest(validB, "tenant-b", campaignB);
assert.equal(writeB.status, 200, await writeB.text());
console.log(
  "WORKERD_STAGING_JWT_PASS: signed RS256 issuer audience expiry signature tenant A/B scoped writes"
);

// Delivery regression: actual staging boundary -> signed JWT -> real local DO.
const browserRead = (token: string, id: string) =>
  authRequest(token, `/api/emp003/drafts?campaignId=${id}`);
assert.equal((await browserRead(validA, campaignA)).status, 200);
assert.equal(
  (await browserRead(validB, campaignA)).status,
  404,
  "foreign ID must never reach tenant A storage"
);
assert.equal(
  (
    await authRequest(
      validA,
      `/api/emp003/drafts?campaignId=${campaignA}&tenantId=tenant-b`
    )
  ).status,
  400
);
const savedA = (await (await browserRead(validA, campaignA)).json()) as {
  revision: number;
  campaign: Record<string, unknown>;
};
const editA = (expectedRevision: number) =>
  authRequest(validA, "/api/emp003/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      campaignId: campaignA,
      blueprint: { ...savedA.campaign, objective: "Portal edited" },
      expectedRevision
    })
  });
assert.equal((await editA(savedA.revision)).status, 200);
assert.equal((await editA(savedA.revision)).status, 409);
const reviewBrowser = (
  token: string,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) =>
  authRequest(token, "/api/emp003/review", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      campaignId: campaignA,
      from,
      to,
      reason: "Delivery certification",
      idempotencyKey: `browser-${from}-${to}`,
      ...extra
    })
  });
assert.equal((await reviewBrowser(validB, "DRAFT", "IN_REVIEW")).status, 404);
assert.equal(
  (await reviewBrowser(validA, "DRAFT", "IN_REVIEW", { tenantId: "tenant-b" }))
    .status,
  400
);
assert.equal(
  (
    await reviewBrowser(
      validA,
      "DRAFT",
      "IN_REVIEW",
      {},
      { origin: "https://foreign.invalid" }
    )
  ).status,
  403
);
assert.equal((await reviewBrowser(validA, "DRAFT", "IN_REVIEW")).status, 200);
assert.equal(
  (await reviewBrowser(validA, "IN_REVIEW", "APPROVED")).status,
  200
);
assert.equal((await reviewBrowser(validA, "APPROVED", "DRAFT")).status, 409);
assert.notEqual((await editA(savedA.revision + 1)).status, 200);
assert.equal(
  ((await (await browserRead(validA, campaignA)).json()) as any).campaign
    .objective,
  "Portal edited"
);
console.log(
  "WORKERD_BROWSER_DELIVERY_PASS: independent GET, cross-tenant isolation, edit CAS, review, APPROVED immutable, origin denial"
);

assert.equal((await authRequest(validA, '/api/emp003/generate-campaign', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic:'Test',objective:'Test',sourceRefs:['https://example.com/']})})).status,503,'authenticated proposal generation fails closed without AI binding');
