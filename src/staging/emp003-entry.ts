import employeeWorker from "../worker";
import { readWorkforceAdminAccessActor } from "../runtime/workforce-admin-access-read";

/**
 * EMP-003 staging-only ingress. Never use the shared production Access policy.
 * Only the read-only browser operations API is permitted until WF-04 certifies
 * a safe agent/WS and console route integration. All other routes fail closed.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const deny = (status: number, error: string) =>
      Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/emp003/operations")
      return deny(404, "EMP003_STAGING_ROUTE_DISABLED");
    if (request.headers.get("upgrade") || request.headers.get("connection")?.toLowerCase().includes("upgrade"))
      return deny(403, "EMP003_STAGING_WEBSOCKET_DISABLED");

    // Dedicated issuer, audience and identity map are mandatory. Missing values
    // must never fall back to production or to unverified email headers.
    const config = env as Env & {
      WORKFORCE_ACCESS_TEAM_DOMAIN?: string;
      WORKFORCE_ACCESS_AUDIENCE?: string;
      ACCESS_IDENTITY_MAP_JSON?: string;
    };
    if (!config.WORKFORCE_ACCESS_TEAM_DOMAIN?.trim() ||
        !config.WORKFORCE_ACCESS_AUDIENCE?.trim() ||
        !config.ACCESS_IDENTITY_MAP_JSON?.trim())
      return deny(503, "EMP003_STAGING_ACCESS_NOT_CONFIGURED");

    try {
      const actor = await readWorkforceAdminAccessActor(request, config);
      if ((actor.role !== "owner" && actor.role !== "user") || !actor.actorId || !actor.tenantId)
        return deny(403, "EMP003_STAGING_ACTOR_FORBIDDEN");
    } catch {
      return deny(401, "EMP003_STAGING_ACCESS_DENIED");
    }
    // Downstream browser handler independently verifies JWT and scopes DO by
    // the server-derived tenant, rejecting cross-tenant response payloads.
    return employeeWorker.fetch(request, env, ctx);
  }
};
