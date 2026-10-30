import employeeWorker from "../worker";
import { readWorkforceAdminAccessActor } from "../runtime/workforce-admin-access-read";
import {
  scopeBoundaryNamespace,
  type BoundaryActor,
  type BoundaryEnv
} from "./workforce-do-boundary";
export {
  EMP002Operations,
  EMP003CampaignState
} from "./workforce-durable-objects";

type StagingEnv = Env &
  BoundaryEnv & {
    STAGING_ACCESS_TEAM_DOMAIN?: string;
    STAGING_ACCESS_AUDIENCE?: string;
    STAGING_IDENTITY_MAP_JSON?: string;
    ASSETS?: { fetch(request: Request): Promise<Response> };
  };
const allowed = new Map<string, Set<string>>([
  ...["", "/content", "/context", "/status", "/approval", "/brand-brain"].map(
    (suffix): [string, Set<string>] => [
      "/api/emp003/assets" + suffix,
      new Set(["GET"])
    ]
  ),
  ...["/generate", "/edit", "/approve"].map((suffix): [string, Set<string>] => [
    "/api/emp003/assets" + suffix,
    new Set(["POST"])
  ]),
  ["/api/emp001/operations", new Set(["GET"])],
  ["/api/emp002/calendar", new Set(["POST"])],
  ["/api/emp003/operations", new Set(["GET"])],
  ["/api/emp003/review", new Set(["GET", "POST"])],
  ["/api/emp003/drafts", new Set(["GET", "POST"])],
  ["/api/emp003/generate-campaign", new Set(["POST"])]
]);
const denied = (status: number, error: string) =>
  Response.json(
    { ok: false, error },
    { status, headers: { "cache-control": "no-store" } }
  );

export default {
  async fetch(
    request: Request,
    env: StagingEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (
      request.headers.get("upgrade") ||
      request.headers.get("connection")?.toLowerCase().includes("upgrade")
    )
      return denied(403, "STAGING_UPGRADE_DENIED");
    if (
      [...request.headers.keys()].some(
        (k) =>
          k.startsWith("x-herreb-internal-") ||
          k.startsWith("x-emp003-copy-") ||
          k.startsWith("x-workforce-do-") ||
          k === "x-emp002-reconciliation-token"
      )
    )
      return denied(403, "STAGING_CLIENT_CONTEXT_DENIED");
    if (
      request.method === "POST" &&
      (request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.has("origin") &&
          request.headers.get("origin") !== url.origin))
    )
      return denied(403, "STAGING_ORIGIN_DENIED");
    const methods = allowed.get(url.pathname);
    const asset =
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/" ||
        url.pathname === "/index.html" ||
        /^\/assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$/.test(
          url.pathname
        ));
    if ((!methods || !methods.has(request.method)) && !asset)
      return denied(404, "STAGING_ROUTE_DISABLED");
    if (
      !env.STAGING_ACCESS_TEAM_DOMAIN?.trim() ||
      !env.STAGING_ACCESS_AUDIENCE?.trim() ||
      !env.STAGING_IDENTITY_MAP_JSON?.trim()
    )
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
    let actor: BoundaryActor;
    try {
      const verified = await readWorkforceAdminAccessActor(
        request,
        isolatedEnv
      );
      actor = verified as BoundaryActor;
      if (
        !["owner", "user"].includes(actor.role) ||
        !actor.actorId ||
        !actor.tenantId
      )
        return denied(403, "STAGING_ACTOR_FORBIDDEN");
    } catch {
      return denied(401, "STAGING_ACCESS_DENIED");
    }
    if (asset) {
      if (!env.ASSETS) return denied(503, "STAGING_ASSETS_UNAVAILABLE");
      const response = await env.ASSETS.fetch(request);
      // Do not return the SPA fallback as a successful missing asset.
      if (
        url.pathname.startsWith("/assets/") &&
        response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("text/html")
      )
        return denied(404, "STAGING_ASSET_NOT_FOUND");
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    if (
      !env.STAGING_DO_BOUNDARY_KEY ||
      new TextEncoder().encode(env.STAGING_DO_BOUNDARY_KEY).length < 32
    )
      return denied(503, "STAGING_BOUNDARY_NOT_CONFIGURED");
    // Bind fresh capabilities to the independently authenticated request actor.
    const scopedEnv = {
      ...isolatedEnv,
      EMP002_OPERATIONS: env.EMP002_OPERATIONS
        ? scopeBoundaryNamespace(env.EMP002_OPERATIONS, env, actor, "calendar")
        : undefined,
      EMP003_CAMPAIGN_STATE: env.EMP003_CAMPAIGN_STATE
        ? scopeBoundaryNamespace(
            env.EMP003_CAMPAIGN_STATE,
            env,
            actor,
            "marketing"
          )
        : undefined
    };
    return employeeWorker.fetch(request, scopedEnv as unknown as Env, ctx);
  }
};
