import employeeWorker from "../worker";
import { readWorkforceAdminAccessActor } from "../runtime/workforce-admin-access-read";
export { ChatAgent, EMP002Operations, WorkforceAdminState, EMP003CampaignState } from "../worker";

type StagingEnv = Env & {
  STAGING_ACCESS_TEAM_DOMAIN?: string;
  STAGING_ACCESS_AUDIENCE?: string;
  STAGING_IDENTITY_MAP_JSON?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};
const allowed = new Map<string, Set<string>>([
  ["/api/emp001/operations", new Set(["GET"])],
  ["/api/emp002/calendar", new Set(["POST"])],
  ["/api/emp003/operations", new Set(["GET"])],
  ["/api/emp003/review", new Set(["GET", "POST"])],
  ["/api/emp003/drafts", new Set(["GET", "POST"])],
  ["/api/emp003/generate-campaign", new Set(["POST"])]
]);
const denied = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request: Request, env: StagingEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") || request.headers.get("connection")?.toLowerCase().includes("upgrade"))
      return denied(403, "STAGING_UPGRADE_DENIED");
    const methods = allowed.get(url.pathname);
    const asset = (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/" || url.pathname === "/index.html" ||
        /^\/assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$/.test(url.pathname));
    if ((!methods || !methods.has(request.method)) && !asset)
      return denied(404, "STAGING_ROUTE_DISABLED");
    if (!env.STAGING_ACCESS_TEAM_DOMAIN?.trim() ||
        !env.STAGING_ACCESS_AUDIENCE?.trim() ||
        !env.STAGING_IDENTITY_MAP_JSON?.trim())
      return denied(503, "STAGING_ACCESS_NOT_CONFIGURED");
    const isolatedEnv = {
      ...env,
      WORKFORCE_ACCESS_TEAM_DOMAIN: env.STAGING_ACCESS_TEAM_DOMAIN,
      WORKFORCE_ACCESS_AUDIENCE: env.STAGING_ACCESS_AUDIENCE,
      ACCESS_IDENTITY_MAP_JSON: env.STAGING_IDENTITY_MAP_JSON,
      WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON: "[]",
      WORKFORCE_PLATFORM_ADMIN_TOKEN: undefined,
      WORKFORCE_PLATFORM_ADMIN_ACTOR_ID: undefined
    };
    try {
      const actor = await readWorkforceAdminAccessActor(request, isolatedEnv);
      if (!["owner", "user"].includes(actor.role) || !actor.actorId || !actor.tenantId)
        return denied(403, "STAGING_ACTOR_FORBIDDEN");
    } catch {
      return denied(401, "STAGING_ACCESS_DENIED");
    }
    if (asset) {
      if (!env.ASSETS) return denied(503, "STAGING_ASSETS_UNAVAILABLE");
      const response = await env.ASSETS.fetch(request);
      // Do not return the SPA fallback as a successful missing asset.
      if (url.pathname.startsWith("/assets/") &&
          response.headers.get("content-type")?.toLowerCase().includes("text/html"))
        return denied(404, "STAGING_ASSET_NOT_FOUND");
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    return employeeWorker.fetch(request, isolatedEnv as Env, ctx);
  }
};
