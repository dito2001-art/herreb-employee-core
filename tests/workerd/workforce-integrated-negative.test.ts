import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";

const base = "http://127.0.0.1:8791/integrated";
const call = (path: string, init?: RequestInit) => fetch(base + path, init);

test("integrated ingress denies internal routes, unsupported methods and malformed assets", async () => {
  for (const path of ["/api/internal/emp003/review", "/api/admin/workforce", "/webhooks/meta/whatsapp", "/agents/ChatAgent/x", "/cdn-cgi/preview", "/api/unknown", "/assets/.hidden", "/assets/app..js", "/favicon.ico"]) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal((await call("/api/emp001/operations", { method: "POST" })).status, 404);
  assert.equal((await call("/api/emp002/calendar", { method: "GET" })).status, 404);
  const upgradeStatus = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(base + "/api/emp003/operations", { headers: { upgrade: "websocket", connection: "Upgrade" } }, response => {
      resolve(response.statusCode ?? 0);
      response.resume();
    });
    req.on("upgrade", () => reject(new Error("INTEGRATED_WEBSOCKET_ACCEPTED")));
    req.on("error", reject);
    req.end();
  });
  assert.equal(upgradeStatus, 403);
});
test("integrated ingress denies missing Access config for all employee APIs and assets", async () => {
  for (const [path, method] of [["/api/emp001/operations","GET"],["/api/emp002/calendar","POST"],["/api/emp003/operations","GET"],["/api/emp003/review","GET"],["/api/emp003/drafts","GET"],["/api/emp003/generate-campaign","POST"],["/","GET"],["/index.html","GET"],["/assets/app.js","GET"]]) {
    assert.equal((await call(path, {method})).status, 503, path);
  }
});
test("forged Access identity headers never authorize integrated ingress", async () => {
  assert.equal((await call("/api/emp003/operations", {headers: {"cf-access-authenticated-user-email":"a@example.test"}})).status, 503);
});
