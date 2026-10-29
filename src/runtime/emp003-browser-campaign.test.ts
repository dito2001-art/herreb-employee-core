import { hashEMP003Blueprint } from "../core/emp003-blueprint-pin";
import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { handleEMP003BrowserCampaign } from "./emp003-browser-campaign";
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
const blueprint = {
  tenantId: "tenant-a",
  correlationId: "corr",
  objective: "Demand",
  audiences: ["buyers"],
  positioning: "Helpful",
  keyMessages: ["Value"],
  channels: [{ name: "Email", actions: ["Draft"] }],
  kpis: [{ metric: "leads", target: "10", measurement: "CRM" }],
  assumptions: [],
  evidenceRefs: ["https://example.com"],
  status: "DRAFT",
  publishApproved: false
};
async function fixture(
  role = "owner",
  options: { foreign?: boolean; failReadback?: boolean } = {}
) {
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
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const data =
    encode({ alg: "RS256", kid: "key" }) +
    "." +
    encode({
      email: "test@example.com",
      iss: "https://test.cloudflareaccess.com",
      aud: "aud",
      iat: now - 10,
      exp: now + 600
    });
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(data)
  );
  const token = data + "." + Buffer.from(signature).toString("base64url");
  const calls: Request[] = [];
  const state = {
    tenantId: "tenant-a",
    campaignId: "campaign",
    state: "IN_REVIEW",
    revision: 1,
    lastCorrelationId: "review-1",
    publishExecuted: false
  };
  const blueprintPin = {
    tenantId: "tenant-a",
    campaignId: "campaign",
    revision: 2,
    sha256: await hashEMP003Blueprint(blueprint),
    idempotencyKey: "review-1",
    correlationId: "review-1"
  };
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "aud",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      {
        email: "test@example.com",
        actorId: "actor-a",
        tenantId: "tenant-a",
        role
      }
    ]),
    EMP003_CAMPAIGN_STATE: {
      idFromName: (id: string) => {
        assert.equal(id, "tenant-a");
        return id;
      },
      get: () => ({
        fetch: async (r: Request) => {
          calls.push(r.clone() as Request);
          const u = new URL(r.url);
          assert.equal(u.searchParams.get("tenantId"), "tenant-a");
          if (u.pathname === "/draft")
            return Response.json({
              ok: true,
              found: true,
              campaign: {
                ...blueprint,
                ...(options.foreign ? { tenantId: "tenant-b" } : {})
              },
              revision: 2
            });
          if (u.pathname === "/transition")
            return Response.json({
              ok: true,
              readBackConfirmed: true,
              state,
              blueprintPin
            });
          if (options.failReadback)
            return new Response("unavailable", { status: 503 });
          return Response.json({ ok: true, found: true, state, blueprintPin });
        }
      })
    }
  };
  const fetcher = (async () =>
    Response.json({
      keys: [{ ...jwk, kid: "key", use: "sig", alg: "RS256" }]
    })) as typeof fetch;
  const request = (
    path = "/api/emp003/drafts?campaignId=campaign",
    body?: Record<string, unknown>,
    extra: Record<string, string> = {}
  ) =>
    new Request("https://staging.example" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "cf-access-jwt-assertion": token,
        "content-type": "application/json",
        ...extra
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  const transition = {
    campaignId: "campaign",
    from: "DRAFT",
    to: "IN_REVIEW",
    reason: "Review",
    idempotencyKey: "review-1",
    blueprintRevision: 2,
    blueprintHash: blueprintPin.sha256
  };
  return { env, fetcher, request, calls, transition };
}
test("independent browser GET validates persisted tenant and revision", async () => {
  const f = await fixture();
  const r = await handleEMP003BrowserCampaign(f.request(), f.env, f.fetcher);
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as Record<string, unknown>).revision, 2);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("caller cannot select tenant or spoof transition actor", async () => {
  const f = await fixture();
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/drafts?campaignId=campaign&tenantId=tenant-b"),
        f.env,
        f.fetcher
      )
    ).status,
    400
  );
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/review", { ...f.transition, actorId: "admin" }),
        f.env,
        f.fetcher
      )
    ).status,
    400
  );
  assert.equal(f.calls.length, 0);
});
test("foreign stored blueprint fails closed", async () => {
  const f = await fixture("owner", { foreign: true });
  assert.equal(
    (await handleEMP003BrowserCampaign(f.request(), f.env, f.fetcher)).status,
    503
  );
});
test("user cannot transition, even with valid JWT", async () => {
  const f = await fixture("user");
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/review", f.transition),
        f.env,
        f.fetcher
      )
    ).status,
    403
  );
  assert.equal(f.calls.length, 0);
});
test("cross-origin mutation is denied before storage", async () => {
  const f = await fixture();
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/review", f.transition, {
          origin: "https://foreign.example"
        }),
        f.env,
        f.fetcher
      )
    ).status,
    403
  );
  assert.equal(f.calls.length, 0);
});
test("review derives actor and confirms independent readback", async () => {
  const f = await fixture();
  const r = await handleEMP003BrowserCampaign(
    f.request("/api/emp003/review", f.transition),
    f.env,
    f.fetcher
  );
  assert.equal(r.status, 200);
  const transition = (await f.calls[1].json()) as Record<string, unknown>;
  assert.equal(transition.actorId, "actor-a");
  assert.equal(transition.actorRole, "owner");
  assert.equal(transition.tenantId, "tenant-a");
  assert.equal(f.calls[2].method, "GET");
});
test("failed readback never reports successful review", async () => {
  const f = await fixture("owner", { failReadback: true });
  const r = await handleEMP003BrowserCampaign(
    f.request("/api/emp003/review", f.transition),
    f.env,
    f.fetcher
  );
  assert.equal(r.status, 503);
  assert.equal(((await r.json()) as Record<string, unknown>).ok, false);
});
test("unsigned request denied before storage", async () => {
  const f = await fixture();
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        new Request(
          "https://staging.example/api/emp003/drafts?campaignId=campaign"
        ),
        f.env,
        f.fetcher
      )
    ).status,
    401
  );
  assert.equal(f.calls.length, 0);
});

test("browser review requires exact displayed revision/hash and forwards the pin to the DO transaction", async () => {
  const f = await fixture();
  const missing = { ...f.transition, blueprintRevision: undefined };
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/review", missing),
        f.env,
        f.fetcher
      )
    ).status,
    400
  );
  assert.equal(f.calls.length, 0);
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/review", {
          ...f.transition,
          blueprintRevision: 1
        }),
        f.env,
        f.fetcher
      )
    ).status,
    409
  );
  assert.equal(f.calls.length, 1);
  assert.equal(
    (
      await handleEMP003BrowserCampaign(
        f.request("/api/emp003/review", {
          ...f.transition,
          blueprintHash: "0".repeat(64)
        }),
        f.env,
        f.fetcher
      )
    ).status,
    409
  );
  const good = await handleEMP003BrowserCampaign(
    f.request("/api/emp003/review", f.transition),
    f.env,
    f.fetcher
  );
  assert.equal(good.status, 200);
  const transition = f.calls.find(
    (r) => new URL(r.url).pathname === "/transition"
  )!;
  const target = new URL(transition.url);
  assert.equal(target.searchParams.get("expectedBlueprintRevision"), "2");
  assert.equal(
    target.searchParams.get("expectedBlueprintHash"),
    f.transition.blueprintHash
  );
});
