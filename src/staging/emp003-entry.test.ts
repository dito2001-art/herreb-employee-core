import assert from "node:assert/strict";
import { test } from "node:test";
import staging from "./emp003-entry";

const env = {} as Parameters<typeof staging.fetch>[1];
const ctx = {} as Parameters<typeof staging.fetch>[2];
const call = (path: string, init?: RequestInit, environment = env) =>
  staging.fetch(new Request("https://emp003-staging.example.test" + path, init), environment, ctx);

test("anonymous read fails closed without staging Access config", async () => {
  const response = await call("/api/emp003/operations");
  assert.equal(response.status, 503);
});

test("anonymous JWT missing fails closed even with configured audience and identities", async () => {
  const response = await call("/api/emp003/operations", undefined, {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "staging-only-audience",
    ACCESS_IDENTITY_MAP_JSON: "[]"
  } as typeof env);
  assert.equal(response.status, 401);
});

test("all internal EMP003 endpoints reject before M2M, even with spoofed headers", async () => {
  for (const path of [
    "/api/internal/emp003/review", "/api/internal/emp003/operations",
    "/api/internal/emp003/drafts", "/api/internal/emp003/generate-campaign",
    "/api/internal/emp003/campaign-blueprint", "/api/internal/emp003/research-draft",
    "/api/internal/emp003/research", "/api/internal/emp003/certification"
  ]) {
    const response = await call(path, { headers: {
      "cf-access-authenticated-user-email": "owner@example.com",
      "x-herreb-workforce-admin-token": "spoofed"
    } });
    assert.equal(response.status, 404, path);
  }
});

test("preview, static assets, agents and websocket paths are denied", async () => {
  for (const path of ["/", "/index.html", "/assets/app.js", "/agents/ChatAgent/tenant",
    "/cdn-cgi/preview", "/api/admin/workforce", "/webhooks/meta/whatsapp"]) {
    assert.equal((await call(path)).status, 404, path);
  }
  const upgrade = await call("/api/emp003/operations", {
    headers: { connection: "Upgrade", upgrade: "websocket" }
  });
  assert.equal(upgrade.status, 403);
});

test("non-GET and forged email header are denied", async () => {
  assert.equal((await call("/api/emp003/operations", { method: "POST" })).status, 404);
  const response = await call("/api/emp003/operations", {
    headers: { "cf-access-authenticated-user-email": "owner@example.com" }
  });
  assert.equal(response.status, 503);
});

// JWT signature, issuer, audience, expiry and tenant A/B cryptographic
// integration tests remain REQUIRED before GO: this negative suite does not
// claim to generate or verify real Cloudflare-signed tokens.
