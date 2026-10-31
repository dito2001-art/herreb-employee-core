// P0 isolated local harness: two independently executing Workers and a SQLite DO.
// No Cloudflare account, network credentials, deployment or production bindings.
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
function jwt(email, audience = "local-aud") {
  const input = encode({ alg: "RS256", kid: "local-key", typ: "JWT" }) + "." +
    encode({ iss: "https://local.cloudflareaccess.com", aud: audience, email, iat: now - 10, exp: now + 300 });
  return input + "." + createSign("RSA-SHA256").update(input).sign(privateKey).toString("base64url");
}
async function bundle(source) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "neutral",
    conditions: ["workerd", "worker", "browser"],
    external: ["cloudflare:workers"]
  });
  return result.outputFiles[0].text;
}
const gateway = await bundle(`
import gateway from "./src/staging/workforce-access-gateway";
export default gateway;
`);
const integrated = await bundle(`
import { EMP002Operations } from "./src/staging/workforce-durable-objects";
import { scopeBoundaryNamespace } from "./src/staging/workforce-do-boundary";
import { readWorkforceAdminAccessActor } from "./src/runtime/workforce-admin-access-read";
export { EMP002Operations };
export default {
  async fetch(request, env) {
    const actor = await readWorkforceAdminAccessActor(request, {
      WORKFORCE_ACCESS_TEAM_DOMAIN: env.STAGING_ACCESS_TEAM_DOMAIN,
      WORKFORCE_ACCESS_AUDIENCE: env.STAGING_ACCESS_AUDIENCE,
      ACCESS_IDENTITY_MAP_JSON: env.STAGING_IDENTITY_MAP_JSON,
      WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON: "[]"
    }).catch(() => null);
    if (!actor) return new Response("ACCESS_DENIED", { status: 401 });
    if (new URL(request.url).pathname !== "/api/emp002/calendar" || request.method !== "POST")
      return new Response("ROUTE_DISABLED", { status: 404 });
    const scoped = scopeBoundaryNamespace(env.EMP002_OPERATIONS, env, actor, "calendar");
    const name = "tenant:" + actor.tenantId;
    return scoped.get(scoped.idFromName(name)).fetch(new Request("https://do.internal/native-calendar", {
      method: "POST", headers: { "content-type": "application/json",
        "x-herreb-internal-tenant-id": actor.tenantId },
      body: await request.text()
    }));
  }
};
`);
const identityMap = JSON.stringify([
  { email: "a@example.test", actorId: "actor-a", tenantId: "tenant-a", role: "owner" },
  { email: "b@example.test", actorId: "actor-b", tenantId: "tenant-b", role: "owner" }
]);
const common = {
  STAGING_ACCESS_TEAM_DOMAIN: "local.cloudflareaccess.com",
  STAGING_ACCESS_AUDIENCE: "local-aud",
  STAGING_IDENTITY_MAP_JSON: identityMap
};
let unexpectedOutbound = 0;
const mf = new Miniflare({
  workers: [
    {
      name: "gateway", modules: true, script: gateway,
      bindings: common,
      serviceBindings: { INTEGRATED: "integrated" }
    },
    {
      name: "integrated", modules: true, script: integrated,
      bindings: { ...common, STAGING_DO_BOUNDARY_KEY: "local-only-boundary-key-32-bytes-or-longer" },
      durableObjects: { EMP002_OPERATIONS: { className: "EMP002Operations", useSQLite: true } }
    }
  ],
  compatibilityDate: "2026-06-11",
  compatibilityFlags: ["nodejs_compat"],
  outboundService: (request) => {
    if (new URL(request.url).href === "https://local.cloudflareaccess.com/cdn-cgi/access/certs")
      return Response.json({ keys: [{ ...jwk, kid: "local-key", alg: "RS256", use: "sig" }] });
    unexpectedOutbound++;
    return new Response("network disabled", { status: 503 });
  }
});
try {
  async function call(token, body, extra = {}) {
    return mf.dispatchFetch("https://staging.example.test/api/emp002/calendar", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-access-jwt-assertion": token,
        "x-herreb-internal-tenant-id": "tenant-a", ...extra },
      body: JSON.stringify(body)
    });
  }
  const a = jwt("a@example.test"), b = jwt("b@example.test");
  const entry = { id: "p0-task", tenantId: "tenant-a", kind: "TASK",
    title: "A private", startsAt: "2026-11-01T12:00:00Z",
    status: "ACTIVE", updatedAt: "2026-10-30T12:00:00Z" };
  const saved = await call(a, { operation: "save", entry, expectedVersion: 0 });
  assert.equal(saved.status, 200, "A save through gateway -> integrated -> DO; response=" + (await saved.clone().text()) + "; unexpectedOutbound=" + unexpectedOutbound);
  const readA = await call(a, { operation: "get", id: entry.id });
  assert.equal(readA.status, 200);
  assert.equal((await readA.json()).entry.title, "A private");
  const readB = await call(b, { operation: "get", id: entry.id });
  assert.equal(readB.status, 200);
  assert.equal((await readB.json()).entry, null, "B must not read A");
  assert.equal((await call(b, { operation: "save", entry, expectedVersion: 0 })).status, 403);
  const bEntry = { ...entry, id: "b-task", tenantId: "tenant-b", title: "B private" };
  assert.equal((await call(b, { operation: "save", entry: bEntry, expectedVersion: 0 })).status, 200);
  assert.equal((await (await call(b, { operation: "get", id: bEntry.id })).json()).entry.title, "B private");
  assert.equal((await (await call(a, { operation: "get", id: bEntry.id })).json()).entry, null);
  assert.equal((await call(jwt("unknown@example.test"), { operation: "get", id: entry.id })).status, 401);
  assert.equal((await call(jwt("a@example.test", "wrong-aud"), { operation: "get", id: entry.id })).status, 401);
  assert.equal((await call("unsigned.jwt.payload", { operation: "get", id: entry.id })).status, 401);
  assert.equal((await call(a, { operation: "get", id: entry.id }, { origin: "https://evil.test" })).status, 403);
  const verify = await call(a, { operation: "get", id: entry.id });
  assert.equal((await verify.json()).entry.title, "A private", "independent read-back");
  assert.equal(unexpectedOutbound, 0);
  console.log("P0 local: two real Workers, RS256 A/B, tenant denial, SQLite DO and read-back PASS");
} finally {
  await mf.dispose();
}
