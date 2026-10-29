import test from "node:test";
import assert from "node:assert/strict";
import ingress from "./workforce-integrated-entry";

const ctx = {} as ExecutionContext;
const empty = {} as Parameters<typeof ingress.fetch>[1];
const request = (path: string, method = "GET", headers: Record<string,string> = {}) =>
  new Request("https://staging.example.test" + path, { method, headers });
const call = (path: string, method = "GET", headers: Record<string,string> = {}, env = empty) =>
  ingress.fetch(request(path, method, headers), env, ctx);

test("internal, admin, webhook and websocket entrypoints are denied before authentication", async () => {
  for (const path of ["/api/internal/emp003/review", "/api/internal/emp002/e2e",
    "/api/admin/workforce", "/webhooks/meta/whatsapp", "/agents/ChatAgent/x",
    "/oauth/callback", "/cdn-cgi/preview", "/api/unknown"]) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal((await call("/api/emp003/operations", "GET", {upgrade:"websocket"})).status, 403);
});
test("every allowed browser endpoint requires dedicated staging configuration", async () => {
  for (const [path, method] of [
    ["/api/emp001/operations","GET"], ["/api/emp002/calendar","POST"],
    ["/api/emp003/operations","GET"], ["/api/emp003/review","POST"],
    ["/api/emp003/drafts","GET"], ["/api/emp003/generate-campaign","POST"],
    ["/","GET"], ["/index.html","GET"], ["/assets/app.js","GET"]
  ]) assert.equal((await call(path, method)).status, 503, path);
});
test("unexpected methods and static paths fail closed", async () => {
  for (const [path, method] of [
    ["/api/emp001/operations","POST"], ["/api/emp002/calendar","GET"],
    ["/api/emp003/operations","POST"], ["/api/emp003/generate-campaign","GET"],
    ["/favicon.ico","GET"], ["/assets/private%2Ffile","GET"]
  ]) assert.equal((await call(path, method)).status, 404, path);
});
test("forged email headers and tenant selectors never authorize access", async () => {
  const env = {STAGING_ACCESS_TEAM_DOMAIN:"staging.cloudflareaccess.com",
    STAGING_ACCESS_AUDIENCE:"staging-only-aud",
    STAGING_IDENTITY_MAP_JSON:JSON.stringify([
      {email:"a@example.test",actorId:"a",tenantId:"tenant-a",role:"owner"},
      {email:"b@example.test",actorId:"b",tenantId:"tenant-b",role:"user"}
    ])} as unknown as typeof empty;
  for (const path of ["/api/emp001/operations?tenantId=tenant-b",
    "/api/emp002/calendar", "/api/emp003/operations", "/"]) {
    const method = path === "/api/emp002/calendar" ? "POST" : "GET";
    const res = await call(path, method, {"cf-access-authenticated-user-email":"a@example.test"}, env);
    assert.equal(res.status, 401, path);
  }
});
