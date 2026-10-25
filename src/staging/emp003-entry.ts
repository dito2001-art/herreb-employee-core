import employeeWorker from "../worker";
// Wrangler requires every DO class bound in the staging manifest to be exported
// by this entrypoint; forwarding these exports does not expose additional routes.
export { ChatAgent, EMP002Operations, WorkforceAdminState, EMP003CampaignState } from "../worker";
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
      EMP003_STAGING_ACCESS_TEAM_DOMAIN?: string;
      EMP003_STAGING_ACCESS_AUDIENCE?: string;
      EMP003_STAGING_IDENTITY_MAP_JSON?: string;
    };
    if (!config.EMP003_STAGING_ACCESS_TEAM_DOMAIN?.trim() ||
        !config.EMP003_STAGING_ACCESS_AUDIENCE?.trim() ||
        !config.EMP003_STAGING_IDENTITY_MAP_JSON?.trim())
      return deny(503, "EMP003_STAGING_ACCESS_NOT_CONFIGURED");

    const isolatedEnv = {
      ...env,
      WORKFORCE_ACCESS_TEAM_DOMAIN: config.EMP003_STAGING_ACCESS_TEAM_DOMAIN,
      WORKFORCE_ACCESS_AUDIENCE: config.EMP003_STAGING_ACCESS_AUDIENCE,
      ACCESS_IDENTITY_MAP_JSON: config.EMP003_STAGING_IDENTITY_MAP_JSON,
      WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON: "[]",
      WORKFORCE_PLATFORM_ADMIN_TOKEN: undefined,
      WORKFORCE_PLATFORM_ADMIN_ACTOR_ID: undefined
    };
    try {
      const actor = await readWorkforceAdminAccessActor(request, isolatedEnv);
      if ((actor.role !== "owner" && actor.role !== "user") || !actor.actorId || !actor.tenantId)
        return deny(403, "EMP003_STAGING_ACTOR_FORBIDDEN");
    } catch {
      return deny(401, "EMP003_STAGING_ACCESS_DENIED");
    }
    // Downstream browser handler independently verifies JWT and scopes DO by
    // the server-derived tenant, rejecting cross-tenant response payloads.
    return employeeWorker.fetch(request, isolatedEnv as Env, ctx);
  }
};
