import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkforceAdminActor } from "./workforce-admin-auth";

const identities = [
  {
    email: "owner@herreb.test",
    tenantId: "herreb-client-0",
    actorId: "fernando",
    role: "owner" as const,
  },
];

test("resolves actor only from authenticated Access email", () => {
  const request = new Request("https://admin.test/api", {
    headers: { "cf-access-authenticated-user-email": " OWNER@HERREB.TEST " },
  });
  assert.deepEqual(resolveWorkforceAdminActor({ request, identities }), {
    actorId: "fernando",
    tenantId: "herreb-client-0",
    role: "owner",
  });
});

test("fails closed without authenticated Access identity", () => {
  const request = new Request("https://admin.test/api");
  assert.throws(
    () => resolveWorkforceAdminActor({ request, identities }),
    /WORKFORCE_ADMIN_AUTH_REQUIRED/
  );
});

test("fails closed for authenticated email not in server-side identity registry", () => {
  const request = new Request("https://admin.test/api", {
    headers: { "cf-access-authenticated-user-email": "attacker@example.test" },
  });
  assert.throws(
    () => resolveWorkforceAdminActor({ request, identities }),
    /WORKFORCE_ADMIN_IDENTITY_NOT_FOUND/
  );
});

test("ignores caller-controlled body when resolving privileges", async () => {
  const request = new Request("https://admin.test/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-access-authenticated-user-email": "owner@herreb.test",
    },
    body: JSON.stringify({ actor: { actorId: "attacker", tenantId: "other", role: "owner" } }),
  });
  const actor = resolveWorkforceAdminActor({ request, identities });
  assert.equal(actor.actorId, "fernando");
  assert.equal(actor.tenantId, "herreb-client-0");
});
