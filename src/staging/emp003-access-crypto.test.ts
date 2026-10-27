import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyWorkforceAccessJwt } from "../runtime/workforce-admin-access-jwt";
import { resolveVerifiedAccessAdminReadActor } from "../runtime/workforce-admin-access-principal";

const issuer = "https://staging.cloudflareaccess.com";
const audience = "emp003-staging-audience";
const now = Math.floor(Date.now() / 1000);
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" } as JsonWebKey & { kid: string; alg: string; use: string };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(overrides: Record<string, unknown> = {}, key = privateKey) {
  const input = [b64({ alg: "RS256", typ: "JWT", kid: "test-kid" }), b64({
    iss: issuer, aud: audience, exp: now + 600, iat: now - 30,
    email: "a@example.test", ...overrides
  })].join(".");
  return input + "." + createSign("RSA-SHA256").update(input).sign(key).toString("base64url");
}
const verify = (jwt: string) => verifyWorkforceAccessJwt({
  jwt, issuer, audience, jwks: { keys: [jwk] }, nowSeconds: now
});
test("valid RS256 JWT issuer/audience yields verified principal", async () => {
  const principal = await verify(token());
  assert.equal(principal.email, "a@example.test");
  assert.equal(principal.audience, audience);
});
test("wrong audience, issuer, expiry and future iat fail closed", async () => {
  for (const claims of [
    { aud: "production-audience" }, { iss: "https://other.cloudflareaccess.com" },
    { exp: now - 1 }, { iat: now + 1000 }, { nbf: now + 1000 }
  ]) await assert.rejects(() => verify(token(claims)), /WORKFORCE_ACCESS_JWT_/);
});
test("tampered JWT and forged signature fail closed", async () => {
  const signed = token();
  const parts = signed.split(".");
  const tampered = parts[0] + "." + b64({
    iss: issuer, aud: audience, exp: now + 600, iat: now - 30, email: "b@example.test"
  }) + "." + parts[2];
  await assert.rejects(() => verify(tampered), /WORKFORCE_ACCESS_JWT_SIGNATURE_INVALID/);
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await assert.rejects(() => verify(token({}, other.privateKey)), /WORKFORCE_ACCESS_JWT_SIGNATURE_INVALID/);
  await assert.rejects(() => verify("invalid"), /WORKFORCE_ACCESS_JWT_MALFORMED/);
});
test("verified tenant A/B actor mapping isolates principals and rejects unknowns", async () => {
  const identities = [
    { email: "a@example.test", actorId: "actor-a", tenantId: "tenant-a", role: "owner" as const },
    { email: "b@example.test", actorId: "actor-b", tenantId: "tenant-b", role: "user" as const }
  ];
  const a = resolveVerifiedAccessAdminReadActor({ principal: await verify(token()),
    expectedIssuer: issuer, expectedAudience: audience, nowSeconds: now, identities });
  const b = resolveVerifiedAccessAdminReadActor({ principal: await verify(token({ email: "b@example.test" })),
    expectedIssuer: issuer, expectedAudience: audience, nowSeconds: now, identities });
  assert.equal(a.tenantId, "tenant-a");
  assert.equal(b.tenantId, "tenant-b");
  assert.notEqual(a.actorId, b.actorId);
  await assert.rejects(async () => resolveVerifiedAccessAdminReadActor({
    principal: await verify(token({ email: "unknown@example.test" })),
    expectedIssuer: issuer, expectedAudience: audience, nowSeconds: now, identities
  }), /WORKFORCE_ACCESS_IDENTITY_NOT_UNIQUE/);
  assert.throws(() => resolveVerifiedAccessAdminReadActor({
    principal: { email: "a@example.test", issuer, audience: "production-audience", expiresAt: now + 600 },
    expectedIssuer: issuer, expectedAudience: audience, nowSeconds: now, identities
  }), /WORKFORCE_ACCESS_PRINCIPAL_INVALID/);
});
