import { strict as assert } from "node:assert";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { verifyWorkforceAccessJwt } from "./workforce-admin-access-jwt";
const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
async function fixture() {
 const pair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
 const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
 const issuer = "https://team.cloudflareaccess.com";
 const audience = "admin-app";
 async function sign(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "key1" }) {
  const data = enc(header) + "." + enc(claims);
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data));
  return data + "." + Buffer.from(signature).toString("base64url");
 }
 const claims = { iss: issuer, aud: audience, exp: 2000, iat: 900, email: "OWNER@example.com" };
 return { sign, claims, input: { issuer, audience, nowSeconds: 1000, jwks: { keys: [{ ...jwk, kid: "key1", alg: "RS256", use: "sig" }] } } };
}
test("accepts correctly signed RS256 Access token", async () => {
 const f = await fixture();
 const result = await verifyWorkforceAccessJwt({ ...f.input, jwt: await f.sign(f.claims) });
 assert.equal(result.email, "owner@example.com");
});
test("rejects signature tampering, invalid audience and expiry", async () => {
 const f = await fixture();
 const jwt = await f.sign(f.claims);
 await assert.rejects(() => verifyWorkforceAccessJwt({ ...f.input, jwt: jwt.slice(0, -2) + "xx" }));
 const wrongAudience = await f.sign({ ...f.claims, aud: "other" });
 await assert.rejects(() => verifyWorkforceAccessJwt({ ...f.input, jwt: wrongAudience }));
 const expired = await f.sign({ ...f.claims, exp: 1000 });
 await assert.rejects(() => verifyWorkforceAccessJwt({ ...f.input, jwt: expired }));
});
test("rejects algorithm substitution and unknown kid", async () => {
 const f = await fixture();
 const wrongAlgorithm = await f.sign(f.claims, { alg: "none", kid: "key1" });
 await assert.rejects(() => verifyWorkforceAccessJwt({ ...f.input, jwt: wrongAlgorithm }));
 const unknownKid = await f.sign(f.claims, { alg: "RS256", kid: "missing" });
 await assert.rejects(() => verifyWorkforceAccessJwt({ ...f.input, jwt: unknownKid }));
});
