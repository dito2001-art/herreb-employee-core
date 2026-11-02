import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePersistedWorkforceActor } from "./workforce-persisted-actor";

const jwtRequest = new Request("https://staging.example/api/emp001/operations", {
  headers: { "cf-access-jwt-assertion": "test-jwt" }
});

test("fails closed when Core binding is absent", async () => {
  await assert.rejects(resolvePersistedWorkforceActor(jwtRequest, {}), /WORKFORCE_AUTHORITY_UNAVAILABLE/);
});
test("requires Access JWT before Core lookup", async () => {
  await assert.rejects(resolvePersistedWorkforceActor(new Request(jwtRequest.url), {
    WORKFORCE_CORE: { fetch: async () => { throw Error("should not fetch"); } }
  }), /WORKFORCE_ACCESS_JWT_REQUIRED/);
});
test("rejects unavailable Core authority", async () => {
  await assert.rejects(resolvePersistedWorkforceActor(jwtRequest, {
    WORKFORCE_CORE: { fetch: async () => new Response(null, { status: 503 }) }
  }), /WORKFORCE_AUTHORITY_UNAVAILABLE/);
});
test("rejects Core denial", async () => {
  await assert.rejects(resolvePersistedWorkforceActor(jwtRequest, {
    WORKFORCE_CORE: { fetch: async () => new Response(null, { status: 403 }) }
  }), /WORKFORCE_ACTOR_FORBIDDEN/);
});
test("rejects malformed Core response", async () => {
  await assert.rejects(resolvePersistedWorkforceActor(jwtRequest, {
    WORKFORCE_CORE: { fetch: async () => Response.json({ ok: true, actorId: "a", tenantId: "A", role: "platform_admin" }) }
  }), /WORKFORCE_AUTHORITY_INVALID/);
});
test("returns only authorized actor fields and forwards JWT alone", async () => {
  let received: Request | undefined;
  const actor = await resolvePersistedWorkforceActor(new Request(jwtRequest.url, {
    headers: { "cf-access-jwt-assertion": "test-jwt", "x-herreb-internal-tenant-id": "B" }
  }), {
    WORKFORCE_CORE: { fetch: async request => {
      received = request;
      return Response.json({ ok: true, actorId: "actor-a", tenantId: "A", role: "owner", secret: "do-not-return" });
    } }
  });
  assert.deepEqual(actor, { actorId: "actor-a", tenantId: "A", role: "owner" });
  assert.equal(received?.headers.get("x-herreb-internal-tenant-id"), null);
  assert.equal(received?.headers.get("cf-access-jwt-assertion"), "test-jwt");
});
