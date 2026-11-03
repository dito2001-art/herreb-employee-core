import { planWorkforceAdminMutation, type WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { DurableWorkforceAdminStore } from "../runtime/workforce-admin-store";

// This key is the existing authoritative store key; do not introduce a second state.
const STATE_KEY = "workforce-admin:state:v1";

type Storage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
};

function validateBootstrap(state: WorkforceAdminMutationPlan): WorkforceAdminMutationPlan {
  if (!Array.isArray(state.manifests) || !Array.isArray(state.identities) ||
      state.manifests.length === 0 || state.identities.length === 0)
    throw new Error("WORKFORCE_ISOLATED_BOOTSTRAP_REQUIRED");

  let validated: WorkforceAdminMutationPlan = { manifests: [], identities: [] };
  for (const tenant of state.manifests) {
    if (!tenant || typeof tenant.tenantId !== "string" || typeof tenant.name !== "string" ||
        !tenant.name.trim() || typeof tenant.knowledgeNamespace !== "string" ||
        !tenant.knowledgeNamespace.trim() || typeof tenant.offeringNamespace !== "string" ||
        !tenant.offeringNamespace.trim() || !Array.isArray(tenant.enabledEmployees))
      throw new Error("WORKFORCE_ISOLATED_TENANT_INVALID");
    validated = planWorkforceAdminMutation(validated, { type: "tenant.create", tenant });
  }
  for (const identity of state.identities) {
    if (!identity || typeof identity.email !== "string" || typeof identity.actorId !== "string" ||
        !identity.actorId.trim() || typeof identity.tenantId !== "string" ||
        (identity.role !== "owner" && identity.role !== "user"))
      throw new Error("WORKFORCE_ISOLATED_IDENTITY_INVALID");
    if (validated.identities.some(existing =>
      existing.email.trim().toLowerCase() === identity.email.trim().toLowerCase()))
      throw new Error("WORKFORCE_ISOLATED_IDENTITY_DUPLICATE");
    validated = planWorkforceAdminMutation(validated, { type: "identity.upsert", identity });
  }
  return validated;
}

/**
 * Called only by the isolated DO constructor under blockConcurrencyWhile.
 * Existing durable state always wins, including deliberate identity revocations.
 * No public route, administrative impersonation, or extra approval workflow.
 */
export async function initializeIsolatedWorkforceStateOnce(
  storage: Storage,
  bootstrap: WorkforceAdminMutationPlan
): Promise<"existing" | "initialized"> {
  const existing = await storage.get<WorkforceAdminMutationPlan>(STATE_KEY);
  if (existing !== undefined) return "existing";
  const validated = validateBootstrap(bootstrap);
  await new DurableWorkforceAdminStore(storage, validated).write(validated);
  return "initialized";
}
