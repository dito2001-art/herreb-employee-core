import type { WorkforceAdminIdentity } from "../core/workforce-admin";
import type { WorkforceAdminWriteActor } from "./workforce-admin-write";

export function resolveWorkforceAdminActor(input: {
  request: Request;
  identities: WorkforceAdminIdentity[];
}): WorkforceAdminWriteActor {
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
