import type { VerifiedAccessPrincipal } from "./workforce-admin-access-principal";

type JsonRecord = Record<string, unknown>;
type AccessJwk = JsonWebKey & { kid?: string; kty?: string; alg?: string; use?: string };
const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("WORKFORCE_ACCESS_JWT_MALFORMED");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
function parsePart(value: string): JsonRecord {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("WORKFORCE_ACCESS_JWT_MALFORMED");
  return parsed as JsonRecord;
}

/**
 * Cryptographically verifies a Cloudflare Access application JWT using an
 * explicitly supplied trusted JWKS. The caller must retrieve JWKS only from
 * its configured Cloudflare Access team endpoint, never from JWT headers.
 */
export async function verifyWorkforceAccessJwt(input: {
  jwt: string;
  issuer: string;
  audience: string;
  jwks: { keys: AccessJwk[] };
  nowSeconds: number;
}): Promise<VerifiedAccessPrincipal> {
  const { jwt, issuer, audience, jwks, nowSeconds } = input;
  if (!issuer.startsWith("https://") || !audience || !Number.isFinite(nowSeconds) || !Array.isArray(jwks?.keys)) throw new Error("WORKFORCE_ACCESS_CONFIG_INVALID");
  if (jwt.length > 16384) throw new Error("WORKFORCE_ACCESS_JWT_MALFORMED");
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("WORKFORCE_ACCESS_JWT_MALFORMED");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parsePart(headerPart);
  const claims = parsePart(payloadPart);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.crit !== undefined) throw new Error("WORKFORCE_ACCESS_JWT_ALGORITHM_REJECTED");
  const matching = jwks.keys.filter(key => key.kid === header.kid && key.kty === "RSA" && (key.alg === undefined || key.alg === "RS256") && (key.use === undefined || key.use === "sig"));
  if (matching.length !== 1) throw new Error("WORKFORCE_ACCESS_JWT_KEY_NOT_FOUND");
  const key = await crypto.subtle.importKey("jwk", matching[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(decodeBase64Url(signaturePart));
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, encoder.encode(headerPart + "." + payloadPart));
  if (!valid) throw new Error("WORKFORCE_ACCESS_JWT_SIGNATURE_INVALID");
  const expectedIssuer = issuer.replace(/\/$/, "");
  const claimIssuer = typeof claims.iss === "string" ? claims.iss.replace(/\/$/, "") : "";
  const claimAudience = claims.aud;
  const audienceMatches = claimAudience === audience || (Array.isArray(claimAudience) && claimAudience.includes(audience));
  if (claimIssuer !== expectedIssuer || !audienceMatches || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= nowSeconds || typeof claims.iat !== "number" || claims.iat > nowSeconds + 60 || (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 60)) {
    throw new Error("WORKFORCE_ACCESS_JWT_CLAIMS_INVALID");
  }
  if (typeof claims.email !== "string" || !claims.email.trim()) throw new Error("WORKFORCE_ACCESS_JWT_EMAIL_INVALID");
  return { email: claims.email.trim().toLowerCase(), issuer: expectedIssuer, audience, expiresAt: claims.exp };
}
