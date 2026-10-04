import type { WorkforceAdminIdentity } from "../core/workforce-admin";
import type { WorkforceAdminWriteActor } from "./workforce-admin-write";

export function resolveWorkforceAdminActor(input: {
  request: Request;
  identities: WorkforceAdminIdentity[];
}): WorkforceAdminWriteActor {
  const internalActorId = input.request.headers.get("x-herreb-internal-actor-id")?.trim();
  const internalTenantId = input.request.headers.get("x-herreb-internal-tenant-id")?.trim();
  const internalRole = input.request.headers.get("x-herreb-internal-role")?.trim();

  if (internalActorId && internalTenantId && (internalRole === "owner" || internalRole === "user")) {
    return {
      actorId: internalActorId,
      tenantId: internalTenantId,
      role: internalRole,
    };
  }

  const email = input.request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (!email) throw new Error("WORKFORCE_ADMIN_AUTH_REQUIRED");
  const identity = input.identities.find((candidate) => candidate.email.trim().toLowerCase() === email);
  if (!identity) throw new Error("WORKFORCE_ADMIN_IDENTITY_NOT_FOUND");
  return {
    actorId: identity.actorId,
    tenantId: identity.tenantId,
    role: identity.role === "owner" ? "owner" : "user",
  };
}
