import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";

type StateBinding = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
};
type AuthorityEnv = {
  WORKFORCE_ACCESS_TEAM_DOMAIN?: string;
  WORKFORCE_ACCESS_AUDIENCE?: string;
  WORKFORCE_ADMIN_STATE?: StateBinding;
};

/** Resolve a verified Access user against the existing persisted Core registry. */
export async function resolvePersistedWorkforceActor(
  request: Request,
  env: AuthorityEnv,
  fetcher: typeof fetch = fetch
): Promise<{ actorId: string; tenantId: string; role: "owner" | "user" }> {
  if (!env.WORKFORCE_ADMIN_STATE) throw new Error("WORKFORCE_AUTHORITY_UNAVAILABLE");
  const stub = env.WORKFORCE_ADMIN_STATE.get(env.WORKFORCE_ADMIN_STATE.idFromName("global"));
  const response = await stub.fetch("https://workforce.admin/state", { method: "GET" });
  if (!response.ok) throw new Error("WORKFORCE_AUTHORITY_UNAVAILABLE");
  const body = (await response.json()) as { ok?: unknown; state?: WorkforceAdminMutationPlan };
  if (body.ok !== true || !body.state || !Array.isArray(body.state.manifests) ||
      !Array.isArray(body.state.identities)) throw new Error("WORKFORCE_AUTHORITY_INVALID");
  const actor = await readWorkforceAdminAccessActor(request, {
    WORKFORCE_ACCESS_TEAM_DOMAIN: env.WORKFORCE_ACCESS_TEAM_DOMAIN,
    WORKFORCE_ACCESS_AUDIENCE: env.WORKFORCE_ACCESS_AUDIENCE,
    WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON: "[]"
  }, fetcher, body.state.identities);
  if ((actor.role !== "owner" && actor.role !== "user") || !actor.actorId || !actor.tenantId ||
      !body.state.manifests.some((manifest) => manifest.tenantId === actor.tenantId))
    throw new Error("WORKFORCE_ACTOR_FORBIDDEN");
  return { actorId: actor.actorId, tenantId: actor.tenantId, role: actor.role };
}
