import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";

type AdminNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
};
type CoreEnv = {
  WORKFORCE_ADMIN_STATE?: AdminNamespace;
  WORKFORCE_ACCESS_TEAM_DOMAIN?: string;
  WORKFORCE_ACCESS_AUDIENCE?: string;
};
const deny = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

export async function handleWorkforceCoreResolveActor(
  request: Request, env: CoreEnv, fetcher: typeof fetch = fetch
): Promise<Response> {
  if (request.method !== "GET") return deny(405, "METHOD_NOT_ALLOWED");
  if (!env.WORKFORCE_ADMIN_STATE) return deny(503, "WORKFORCE_AUTHORITY_UNAVAILABLE");
  if (!request.headers.get("cf-access-jwt-assertion")?.trim())
    return deny(401, "WORKFORCE_ACCESS_JWT_REQUIRED");
  try {
    const stub = env.WORKFORCE_ADMIN_STATE.get(env.WORKFORCE_ADMIN_STATE.idFromName("global"));
    const response = await stub.fetch("https://workforce.admin/state", { method: "GET" });
    if (!response.ok) return deny(503, "WORKFORCE_AUTHORITY_UNAVAILABLE");
    const body = (await response.json()) as { ok?: unknown; state?: WorkforceAdminMutationPlan };
    if (body.ok !== true || !Array.isArray(body.state?.manifests) ||
        !Array.isArray(body.state?.identities)) return deny(503, "WORKFORCE_AUTHORITY_INVALID");
    const actor = await readWorkforceAdminAccessActor(request, {
      WORKFORCE_ACCESS_TEAM_DOMAIN: env.WORKFORCE_ACCESS_TEAM_DOMAIN,
      WORKFORCE_ACCESS_AUDIENCE: env.WORKFORCE_ACCESS_AUDIENCE,
      WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON: "[]"
    }, fetcher, body.state.identities);
    if (!actor.actorId || !actor.tenantId || (actor.role !== "owner" && actor.role !== "user"))
      return deny(403, "WORKFORCE_ACTOR_FORBIDDEN");
    const manifest = body.state.manifests.find(item => item.tenantId === actor.tenantId);
    if (!manifest || !Array.isArray(manifest.enabledEmployees))
      return deny(403, "WORKFORCE_ACTOR_FORBIDDEN");
    return Response.json({
      ok: true, actorId: actor.actorId, tenantId: actor.tenantId, role: actor.role,
      enabledEmployees: manifest.enabledEmployees
    }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "";
    if (error.startsWith("WORKFORCE_ACCESS_JWT_") ||
        error.startsWith("WORKFORCE_ACCESS_PRINCIPAL_") ||
        error.startsWith("WORKFORCE_ACCESS_IDENTITY_"))
      return deny(401, "WORKFORCE_ACCESS_DENIED");
    return deny(503, "WORKFORCE_AUTHORITY_UNAVAILABLE");
  }
}
