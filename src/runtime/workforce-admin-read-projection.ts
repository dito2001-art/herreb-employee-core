import { buildWorkforceAdminSnapshot, type WorkforceAdminSnapshot } from "../core/workforce-admin";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { scopeWorkforceAdminSnapshot, type AdminReadActor } from "./workforce-admin-scoped-read";

/**
 * Convert the durable admin state to the UI contract, then scope it before
 * serialization. Caller must resolve actor from a verified server-side identity.
 */
export function projectAuthorizedWorkforceAdminRead(
  state: WorkforceAdminMutationPlan,
  actor: AdminReadActor | undefined
): WorkforceAdminSnapshot {
  if (!actor) throw new Error("WORKFORCE_ADMIN_READ_AUTH_REQUIRED");
  // Project the authorized tenant first: malformed data in an unrelated tenant
  // must not be exposed to or processed on behalf of a tenant owner.
  if (actor.role === "owner") {
    const manifests = state.manifests.filter(item => item.tenantId === actor.tenantId);
    const identities = state.identities.filter(item => item.tenantId === actor.tenantId);
    return scopeWorkforceAdminSnapshot(buildWorkforceAdminSnapshot(manifests, identities), actor);
  }
  if (actor.role === "platform_admin" && actor.tenantId === "platform") {
    return scopeWorkforceAdminSnapshot(buildWorkforceAdminSnapshot(state.manifests, state.identities), actor);
  }
  throw new Error("WORKFORCE_ADMIN_READ_FORBIDDEN");
}
