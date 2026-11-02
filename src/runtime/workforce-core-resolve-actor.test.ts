import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { planWorkforceAdminMutation, type WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { handleWorkforceCoreResolveActor } from "./workforce-core-resolve-actor";

test("Core resolves newly onboarded C from persisted admin state and isolates A/B/C", async () => {
  const pair = await webcrypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const sign = async (email: string, audience = "workforce-test-aud") => {
    const data = b64({ alg: "RS256", kid: "test-key" }) + "." +
      b64({ email, iss: "https://herreb.cloudflareaccess.com", aud: audience, iat: now - 10, exp: now + 300 });
    const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data));
    return data + "." + Buffer.from(signature).toString("base64url");
  };
  const manifest = (tenantId: string, enabledEmployees: Array<"EMP-001" | "EMP-002" | "EMP-003">) =>
    ({ tenantId, name: tenantId, enabledEmployees, knowledgeNamespace: tenantId + "-k", offeringNamespace: tenantId + "-o" });
  let persisted: WorkforceAdminMutationPlan = { manifests: [], identities: [] };
  for (const [tenant, email, employees] of [
    ["tenant-a", "a@example.test", ["EMP-001", "EMP-002", "EMP-003"]],
    ["tenant-b", "b@example.test", ["EMP-003"]],
    ["tenant-c", "c@example.test", ["EMP-001"]]
  ] as const) {
    persisted = planWorkforceAdminMutation(persisted, {
      type: "tenant.create", tenant: manifest(tenant, [...employees])
    });
    persisted = planWorkforceAdminMutation(persisted, {
      type: "identity.upsert", identity: { email, actorId: "actor-" + tenant, tenantId: tenant, role: "owner" }
    });
  }
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "herreb.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "workforce-test-aud",
    WORKFORCE_ADMIN_STATE: {
      idFromName: (name: string) => { assert.equal(name, "global"); return name; },
      get: () => ({ fetch: async () => Response.json({ ok: true, state: persisted }) })
    }
  };
  const fetcher = (async () => Response.json({ keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] })) as typeof fetch;
  for (const [email, tenant, employees] of [
    ["a@example.test", "tenant-a", ["EMP-001", "EMP-002", "EMP-003"]],
    ["b@example.test", "tenant-b", ["EMP-003"]],
    ["c@example.test", "tenant-c", ["EMP-001"]]
  ] as const) {
    const response = await handleWorkforceCoreResolveActor(
      new Request("https://workforce.core.internal/api/internal/workforce/resolve-actor", {
        headers: { "cf-access-jwt-assertion": await sign(email), "x-herreb-internal-tenant-id": "tenant-other" }
      }), env, fetcher);
    assert.equal(response.status, 200, email);
    const body = await response.json() as { tenantId: string; enabledEmployees: string[] };
    assert.equal(body.tenantId, tenant);
    assert.deepEqual(body.enabledEmployees, [...employees]);
  }
  const invalidAudience = await handleWorkforceCoreResolveActor(
    new Request("https://workforce.core.internal/api/internal/workforce/resolve-actor", {
      headers: { "cf-access-jwt-assertion": await sign("c@example.test", "wrong-audience") }
    }), env, fetcher);
  assert.equal(invalidAudience.status, 401);
  persisted = planWorkforceAdminMutation(persisted, { type: "identity.delete", email: "c@example.test" });
  const revoked = await handleWorkforceCoreResolveActor(
    new Request("https://workforce.core.internal/api/internal/workforce/resolve-actor", {
      headers: { "cf-access-jwt-assertion": await sign("c@example.test") }
    }), env, fetcher);
  assert.equal(revoked.status, 401);
});
