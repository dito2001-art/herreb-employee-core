import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { handleEMP003BrowserGenerate } from "./emp003-browser-generate";
import { generateEMP003Campaign } from "./emp003-generate-campaign";
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
async function fixture(role = "owner") {
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
  const payload =
    encode({ alg: "RS256", kid: "gen" }) +
    "." +
    encode({
      iss: "https://gen.cloudflareaccess.com",
      aud: "gen",
      email: "a@test.invalid",
      iat: now - 10,
      exp: now + 600
    });
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(payload)
  );
  const jwt = payload + "." + Buffer.from(signature).toString("base64url");
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "gen.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "gen",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      { email: "a@test.invalid", actorId: "a", tenantId: "tenant-a", role }
    ])
  };
  const fetcher = (async () =>
    Response.json({
      keys: [{ ...jwk, kid: "gen", alg: "RS256", use: "sig" }]
    })) as typeof fetch;
  const input = {
    topic: "Campaña",
    objective: "Más consultas",
    sourceRefs: ["https://example.com/"]
  };
  let calls = 0;
  let tenant = "";
  let storageRequested = false;
  const generate: typeof generateEMP003Campaign = async (_env, tid, body) => {
    calls++;
    tenant = tid;
    storageRequested = body.saveDraft === true;
    return Response.json({
      ok: true,
      publishExecuted: false,
      blueprint: {
        tenantId: tid,
        correlationId: body.correlationId,
        objective: body.objective,
        audiences: ["B2B"],
        positioning: "Útil",
        keyMessages: ["Valor"],
        channels: [{ name: "Email", actions: ["Preparar copia"] }],
        kpis: [{ metric: "Consultas", target: "TBD", measurement: "Registro" }],
        assumptions: [],
        evidenceRefs: body.sourceRefs,
        status: "DRAFT",
        publishApproved: false
      }
    });
  };
  const request = (
    body: unknown = input,
    headers: Record<string, string> = {}
  ) =>
    new Request("https://portal.test/api/emp003/generate-campaign", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-jwt-assertion": jwt,
        ...headers
      },
      body: JSON.stringify(body)
    });
  return {
    env,
    fetcher,
    generate,
    request,
    input,
    seen: () => ({ calls, tenant, storageRequested })
  };
}
test("verified owner generates a tenant-scoped proposal without persistence or publication", async () => {
  const f = await fixture();
  const r = await handleEMP003BrowserGenerate(
    f.request(),
    f.env,
    f.fetcher,
    f.generate
  );
  assert.equal(r.status, 200);
  const data = (await r.json()) as {
    persisted: boolean;
    publishExecuted: boolean;
    blueprint: { tenantId: string };
  };
  assert.equal(data.persisted, false);
  assert.equal(data.publishExecuted, false);
  assert.equal(data.blueprint.tenantId, "tenant-a");
  assert.deepEqual(f.seen(), {
    calls: 1,
    tenant: "tenant-a",
    storageRequested: false
  });
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("unknown scope, storage selectors and non-HTTPS sources never invoke generation", async () => {
  const f = await fixture();
  for (const body of [
    { ...f.input, tenantId: "tenant-b" },
    { ...f.input, saveDraft: true },
    { ...f.input, campaignId: "overwrite" },
    { ...f.input, sourceRefs: ["http://example.com/"] },
    { ...f.input, sourceRefs: [] }
  ])
    assert.equal(
      (
        await handleEMP003BrowserGenerate(
          f.request(body),
          f.env,
          f.fetcher,
          f.generate
        )
      ).status,
      400
    );
  assert.equal(f.seen().calls, 0);
});
test("user role, forged identity and cross-origin requests fail before generation", async () => {
  const f = await fixture("user");
  assert.equal(
    (
      await handleEMP003BrowserGenerate(
        f.request(),
        f.env,
        f.fetcher,
        f.generate
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleEMP003BrowserGenerate(
        f.request(f.input, { "cf-access-jwt-assertion": "forged" }),
        f.env,
        f.fetcher,
        f.generate
      )
    ).status,
    401
  );
  assert.equal(
    (
      await handleEMP003BrowserGenerate(
        f.request(f.input, { origin: "https://foreign.test" }),
        f.env,
        f.fetcher,
        f.generate
      )
    ).status,
    403
  );
  assert.equal(f.seen().calls, 0);
});
test("foreign generated payload and provider failure never become a verified proposal", async () => {
  const f = await fixture();
  const foreign: typeof generateEMP003Campaign = async (...args) => {
    const r = await f.generate(...args);
    const body = (await r.json()) as { blueprint: { tenantId: string } };
    body.blueprint.tenantId = "tenant-b";
    return Response.json(body);
  };
  assert.equal(
    (await handleEMP003BrowserGenerate(f.request(), f.env, f.fetcher, foreign))
      .status,
    503
  );
  assert.equal(
    (
      await handleEMP003BrowserGenerate(
        f.request(),
        f.env,
        f.fetcher,
        async () => new Response("failed", { status: 503 })
      )
    ).status,
    503
  );
});
test("shared real service fails closed without AI or isolated research configuration", async () => {
  assert.equal((await generateEMP003Campaign({}, "tenant-a", {})).status, 503);
  assert.equal(
    (
      await generateEMP003Campaign({ AI: {} as Ai }, "tenant-a", {
        ...{ topic: "t", objective: "o", sourceRefs: ["https://example.com"] },
        correlationId: "c"
      })
    ).status,
    503
  );
});

test("shared service rejects unapproved research sources before Browser or AI calls", async () => {
  let calls = 0;
  const response = await generateEMP003Campaign(
    {
      AI: {} as Ai,
      BROWSER: {
        quickAction: async () => {
          calls++;
          throw new Error("must not fetch");
        }
      },
      EMP003_RESEARCH_TENANT_ID: "tenant-a",
      EMP003_RESEARCH_ALLOWED_HOSTS_JSON: JSON.stringify(["allowed.example"])
    },
    "tenant-a",
    {
      topic: "t",
      objective: "o",
      correlationId: "c",
      sourceRefs: ["https://forbidden.example/"]
    }
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});
