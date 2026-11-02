import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePersistedWorkforceActor } from "./workforce-persisted-actor";

const request = new Request("https://staging.example/api/emp001/operations");

test("fails closed when admin binding is absent", async () => {
  await assert.rejects(
    resolvePersistedWorkforceActor(request, {}),
    /WORKFORCE_AUTHORITY_UNAVAILABLE/
  );
});

test("fails closed when admin state is unavailable", async () => {
  await assert.rejects(
    resolvePersistedWorkforceActor(request, {
      WORKFORCE_ADMIN_STATE: {
        idFromName: () => "global",
        get: () => ({ fetch: async () => new Response(null, { status: 503 }) })
      }
    }),
    /WORKFORCE_AUTHORITY_UNAVAILABLE/
  );
});

test("rejects malformed authoritative state", async () => {
  await assert.rejects(
    resolvePersistedWorkforceActor(request, {
      WORKFORCE_ADMIN_STATE: {
        idFromName: () => "global",
        get: () => ({ fetch: async () => Response.json({ ok: true, state: { identities: [] } }) })
      }
    }),
    /WORKFORCE_AUTHORITY_INVALID/
  );
});

test("never falls back to static identities when JWT is absent", async () => {
  await assert.rejects(
    resolvePersistedWorkforceActor(request, {
      WORKFORCE_ACCESS_TEAM_DOMAIN: "herreb.cloudflareaccess.com",
      WORKFORCE_ACCESS_AUDIENCE: "test-audience",
      WORKFORCE_ADMIN_STATE: {
        idFromName: () => "global",
        get: () => ({ fetch: async () => Response.json({
          ok: true,
          state: {
            manifests: [{ tenantId: "A" }],
            identities: [{ email: "owner@example.com", actorId: "owner", tenantId: "A", role: "owner" }]
          }
        }) })
      }
    }),
    /WORKFORCE_ACCESS_JWT_REQUIRED/
  );
});
