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
    bundle: true, write: false, format: "esm", platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    external: ["cloudflare:*", "node:*", "path"]
  });
  return result.outputFiles[0].text;
}
const gateway = await bundle(`export {default} from "./src/staging/workforce-access-gateway";`);
const integrated = await bundle(`export {default,EMP002Operations,EMP003CampaignState} from "./src/staging/workforce-integrated-entry";`);
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
let localJwks = 0;
const outboundService = (request) => {
  if (request.url === "https://local.cloudflareaccess.com/cdn-cgi/access/certs") {
    localJwks++;
    return Response.json({keys:[{...jwk,kid:"local-key",alg:"RS256",use:"sig"}]});
  }
  unexpectedOutbound++;
  return new Response("network disabled", {status:503});
};
const mf = new Miniflare({
  // Miniflare otherwise refreshes Request.cf from workers.cloudflare.com.
  // Explicit false takes its documented offline fallback before any host fetch.
  cf: false,
  workers: [
    {
      name: "gateway", modules: true, script: gateway,
      compatibilityDate: "2026-06-11", compatibilityFlags: ["nodejs_compat"], outboundService,
      bindings: common,
      serviceBindings: { INTEGRATED: "integrated" }
    },
    {
      name: "integrated", modules: true, script: integrated,
      compatibilityDate: "2026-06-11", compatibilityFlags: ["nodejs_compat"], outboundService,
      bindings: { ...common, STAGING_DO_BOUNDARY_KEY: "local-only-boundary-key-32-bytes-or-longer" },
      durableObjects: { EMP002_OPERATIONS: { className: "EMP002Operations", useSQLite: true } }
    }
  ]
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
  const entry = { id: "p0-task", kind: "TASK",
    title: "A private", startsAt: "2026-11-01T12:00:00Z",
    status: "ACTIVE" };
  const saved = await call(a, { operation: "save", entry, expectedVersion: 0 });
  assert.equal(saved.status, 200, "A save through gateway -> integrated -> DO; response=" + (await saved.clone().text()) + "; unexpectedOutbound=" + unexpectedOutbound);
  const readA = await call(a, { operation: "get", id: entry.id });
  assert.equal(readA.status, 200);
  assert.equal((await readA.json()).entry.title, "A private");
  const readB = await call(b, { operation: "get", id: entry.id });
  assert.equal(readB.status, 404, "B must not read existing A record");
  assert.equal((await call(b, { operation: "save", entry:{...entry,tenantId:"tenant-a"}, expectedVersion: 0 })).status, 400);
  const bEntry = { ...entry, id: "b-task", title: "B private" };
  assert.equal((await call(b, { operation: "save", entry: bEntry, expectedVersion: 0 })).status, 200);
  assert.equal((await (await call(b, { operation: "get", id: bEntry.id })).json()).entry.title, "B private");
  assert.equal((await call(a, { operation: "get", id: bEntry.id })).status, 404);
  assert.equal((await call(jwt("unknown@example.test"), { operation: "get", id: entry.id })).status, 401);
  assert.equal((await call(jwt("a@example.test", "wrong-aud"), { operation: "get", id: entry.id })).status, 401);
  assert.equal((await call("unsigned.jwt.payload", { operation: "get", id: entry.id })).status, 401);
  assert.equal((await call(a, { operation: "get", id: entry.id }, { origin: "https://evil.test" })).status, 403);
  const verify = await call(a, { operation: "get", id: entry.id });
  assert.equal((await verify.json()).entry.title, "A private", "independent read-back");
  const version=(await (await call(a,{operation:"get",id:entry.id})).json()).entry.version;
  const races=await Promise.all(["first","second"].map(title=>call(a,{operation:"save",expectedVersion:version,entry:{...entry,title}})));
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  const updated=(await (await call(a,{operation:"get",id:entry.id})).json()).entry;
  assert.equal(updated.version,version+1);
  assert.equal((await call(a,{operation:"save",expectedVersion:updated.version,entry:{...entry,status:"CANCELLED"}})).status,200);
  assert.equal((await (await call(a,{operation:"get",id:entry.id})).json()).entry.status,"CANCELLED");
  assert.equal((await (await call(b,{operation:"get",id:bEntry.id})).json()).entry.title,"B private");
  const ns=await mf.getDurableObjectNamespace("EMP002_OPERATIONS","integrated");
  assert.equal((await ns.get(ns.idFromName("tenant:tenant-a")).fetch("https://do.test/native-calendar",{method:"POST",body:"{}"})).status,403);
  assert.ok(localJwks>=2,"each real Worker must use local JWKS");
  assert.equal(unexpectedOutbound, 0);
  console.log("P0 LOCAL PASS: actual gateway + actual integrated entry + SQLite DO; RS256 A/B, bidirectional isolation, CAS/cancel/read-back; external egress=0; not remote E2E");
} finally {
  await mf.dispose();
}
