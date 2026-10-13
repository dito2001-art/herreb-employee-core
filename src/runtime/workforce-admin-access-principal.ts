import type { WorkforceAdminIdentity } from "../core/workforce-admin";
import type { AdminReadActor } from "./workforce-admin-scoped-read";

/** Only pass identities obtained from a cryptographically verified Access JWT. */
export interface VerifiedAccessPrincipal {
  email: string;
  issuer: string;
  audience: string;
  expiresAt: number;
}

export function resolveVerifiedAccessAdminReadActor(input: {
  principal: VerifiedAccessPrincipal | undefined;
  expectedIssuer: string;
  expectedAudience: string;
  nowSeconds: number;
  identities: WorkforceAdminIdentity[];
}): AdminReadActor {
  const { principal, expectedIssuer, expectedAudience, nowSeconds, identities } = input;
  if (!principal || !expectedIssuer || !expectedAudience || !Number.isFinite(nowSeconds)) throw new Error("WORKFORCE_ACCESS_VERIFICATION_REQUIRED");
  if (principal.issuer !== expectedIssuer || principal.audience !== expectedAudience || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= nowSeconds) {
    throw new Error("WORKFORCE_ACCESS_PRINCIPAL_INVALID");
  }
  const email = principal.email.trim().toLowerCase();
  if (!email) throw new Error("WORKFORCE_ACCESS_PRINCIPAL_INVALID");
  const matches = identities.filter(identity => identity.email.trim().toLowerCase() === email);
  if (matches.length !== 1) throw new Error("WORKFORCE_ACCESS_IDENTITY_NOT_UNIQUE");
  const identity = matches[0];
  if (!identity.actorId.trim() || !identity.tenantId.trim()) throw new Error("WORKFORCE_ACCESS_IDENTITY_INVALID");
  return { actorId: identity.actorId, tenantId: identity.tenantId, role: identity.role };
}
