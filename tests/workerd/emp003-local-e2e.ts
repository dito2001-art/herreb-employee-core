import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";

const base = process.env.WF00_WORKERD_URL ?? "http://127.0.0.1:8791";
const tenant = "wf00-" + randomUUID().replaceAll("-", "").slice(0,12);
const campaignId = "campaign-" + randomUUID().replaceAll("-", "").slice(0,12);
const blueprint = (objective: string) => ({
  tenantId: tenant, correlationId: "corr-" + objective, objective,
  audiences: ["B2B"], positioning: "Helpful", keyMessages: ["Fast"],
  channels: [{ name: "Email", actions: ["Draft"] }],
  kpis: [{ metric: "Leads", target: "TBD", measurement: "CRM" }],
  assumptions: [], evidenceRefs: ["https://developers.cloudflare.com/"],
  status: "DRAFT", publishApproved: false
});
const endpoint = (suffix = "") => `${base}/fixture/draft?tenantId=${tenant}&campaignId=${campaignId}${suffix}`;
async function write(objective: string, suffix: string) {
  const response = await fetch(endpoint(suffix), { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(blueprint(objective)) });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
async function read() {
  const response = await fetch(endpoint());
  assert.equal(response.status, 200);
  return response.json() as Promise<Record<string, any>>;
}
const initial = await write("initial", "&createOnly=1");
assert.equal(initial.status, 200, JSON.stringify(initial));
assert.equal(initial.body.revision, 1);
assert.equal((await read()).campaign.objective, "initial");
const duplicate = await write("duplicate", "&createOnly=1");
assert.equal(duplicate.status, 409);
const [first, second] = await Promise.all([write("first", "&expectedRevision=1"), write("second", "&expectedRevision=1")]);
assert.deepEqual([first.status, second.status].sort(), [200, 409]);
const accepted = first.status === 200 ? "first" : "second";
const persisted = await read();
assert.equal(persisted.revision, 2);
assert.equal(persisted.campaign.objective, accepted);
assert.equal((await write("stale", "&expectedRevision=1")).status, 409);
assert.equal((await read()).campaign.objective, accepted);
const transition = { tenantId: tenant, campaignId, correlationId: "review-1",
  actorId: "owner", actorRole: "owner", from: "DRAFT", to: "IN_REVIEW",
  reason: "Review", idempotencyKey: "review-1" };
const transitionUrl = `${base}/fixture/transition?tenantId=${tenant}&campaignId=${campaignId}`;
const review = await fetch(transitionUrl, { method: "POST",
  headers: { "content-type": "application/json" }, body: JSON.stringify(transition) });
assert.equal(review.status, 200, await review.text());
assert.notEqual((await write("blocked", "&expectedRevision=2")).status, 200);
assert.equal((await read()).campaign.objective, accepted);
console.log("WORKERD_DO_PASS: create, duplicate, concurrent CAS, stale revision, readback, reviewed immutable");

const stagingRequest = async (path: string, init?: RequestInit) =>
  fetch(base + "/staging" + path, init);
for (const path of ["/api/internal/emp003/drafts", "/agents/ChatAgent/tenant",
  "/cdn-cgi/preview", "/api/admin/workforce", "/webhooks/meta/whatsapp",
  "/api/emp003/operations/extra"]) {
  assert.equal((await stagingRequest(path)).status, 404, path);
}
assert.equal((await stagingRequest("/api/emp003/operations")).status, 503);
assert.equal((await stagingRequest("/api/emp003/drafts", { method: "POST",
  headers: { "content-type": "application/json" }, body: "{}" })).status, 503);
const websocketStatus = await new Promise<number>((resolve, reject) => {
  const req = httpRequest(base + "/staging/api/emp003/operations", {
    headers: { upgrade: "websocket", connection: "Upgrade" }
  }, response => { resolve(response.statusCode ?? 0); response.resume(); });
  req.on("upgrade", () => reject(new Error("STAGING_WEBSOCKET_UPGRADE_ACCEPTED")));
  req.on("error", reject);
  req.end();
});
assert.equal(websocketStatus, 403);
console.log("WORKERD_STAGING_NEGATIVE_PASS: routes, missing Access config, WebSocket");
