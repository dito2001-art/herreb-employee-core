import employeeWorker from "../worker";
import { handleEMP003BrowserGenerate } from "../runtime/emp003-browser-generate";
// Wrangler requires every DO class bound in the staging manifest to be exported
// by this entrypoint; forwarding these exports does not expose additional routes.
export {
  ChatAgent,
  EMP002Operations,
  WorkforceAdminState,
  EMP003CampaignState
} from "../worker";
import { readWorkforceAdminAccessActor } from "../runtime/workforce-admin-access-read";
import { handleEMP003BrowserCampaign } from "../runtime/emp003-browser-campaign";
import { handleEMP003BrowserDraftWrite } from "../runtime/emp003-browser-draft-write";

/**
 * EMP-003 staging-only ingress. Never use the shared production Access policy.
 * Only explicit Access-authenticated campaign browser routes and assets are allowed.
 * Internal M2M, agents, publication and WebSockets remain disabled.
 */
export function createEMP003StagingEntry(jwksFetcher: typeof fetch = fetch) {
  return {
    async fetch(
      request: Request,
      env: Env,
      ctx: ExecutionContext
    ): Promise<Response> {
      const deny = (status: number, error: string) =>
        Response.json(
          { ok: false, error },
          { status, headers: { "cache-control": "no-store" } }
        );
      const url = new URL(request.url);
      const operationsRead =
        request.method === "GET" && url.pathname === "/api/emp003/operations";
      // Do not treat SPA fallback as an authorization decision. Explicit paths only.
      const assetRead =
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/" ||
          url.pathname === "/index.html" ||
          (url.pathname.startsWith("/assets/") &&
            /^[a-zA-Z0-9_./-]+$/.test(url.pathname.slice(8)))) &&
        !url.pathname
          .split("/")
          .some((segment) => segment === "." || segment === "..") &&
        !/%2f|%5c|%2e/i.test(url.pathname);
      const draftWrite =
        request.method === "POST" && url.pathname === "/api/emp003/drafts";
      const campaignRead =
        request.method === "GET" && url.pathname === "/api/emp003/drafts";
      const reviewWrite =
        request.method === "POST" && url.pathname === "/api/emp003/review";
      const generateProposal =
        request.method === "POST" &&
        url.pathname === "/api/emp003/generate-campaign";
      if (
        !operationsRead &&
        !assetRead &&
        !draftWrite &&
        !campaignRead &&
        !reviewWrite &&
        !generateProposal
      )
        return deny(404, "EMP003_STAGING_ROUTE_DISABLED");
      if (
        request.headers.get("upgrade") ||
        request.headers.get("connection")?.toLowerCase().includes("upgrade")
      )
        return deny(403, "EMP003_STAGING_WEBSOCKET_DISABLED");

      // Dedicated issuer, audience and identity map are mandatory. Missing values
      // must never fall back to production or to unverified email headers.
      const config = env as Env & {
        EMP003_STAGING_ACCESS_TEAM_DOMAIN?: string;
        EMP003_STAGING_ACCESS_AUDIENCE?: string;
        EMP003_STAGING_IDENTITY_MAP_JSON?: string;
      };
      if (
        !config.EMP003_STAGING_ACCESS_TEAM_DOMAIN?.trim() ||
        !config.EMP003_STAGING_ACCESS_AUDIENCE?.trim() ||
        !config.EMP003_STAGING_IDENTITY_MAP_JSON?.trim()
      )
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
        const actor = await readWorkforceAdminAccessActor(
          request,
          isolatedEnv,
          jwksFetcher
        );
        if (
          (actor.role !== "owner" && actor.role !== "user") ||
          !actor.actorId ||
          !actor.tenantId
        )
          return deny(403, "EMP003_STAGING_ACTOR_FORBIDDEN");
      } catch {
        return deny(401, "EMP003_STAGING_ACCESS_DENIED");
      }
      if (campaignRead || reviewWrite)
        return handleEMP003BrowserCampaign(request, isolatedEnv, jwksFetcher);
      if (generateProposal)
        return handleEMP003BrowserGenerate(request, isolatedEnv, jwksFetcher);
      if (draftWrite)
        return handleEMP003BrowserDraftWrite(request, isolatedEnv, jwksFetcher);
      if (assetRead) {
        const assets = (
          env as Env & {
            ASSETS?: { fetch(request: Request): Promise<Response> };
          }
        ).ASSETS;
        if (!assets) return deny(503, "EMP003_STAGING_ASSETS_UNAVAILABLE");
        const response = await assets.fetch(request);
        const headers = new Headers(response.headers);
        headers.set("cache-control", "private, no-store");
        const privateResponse = new Response(response.body, {
          status: response.status,
          headers
        });
        if (response.ok && headers.get("content-type")?.includes("text/html")) {
          return new HTMLRewriter()
            .on("html", {
              element(element) {
                element.setAttribute("data-workforce-mode", "emp003");
                element.setAttribute("lang", "es-PY");
              }
            })
            .on("title", {
              element(element) {
                element.setInnerContent("EMP-003 · HerreB AI Marketer");
              }
            })
            .transform(privateResponse);
        }
        return privateResponse;
      }
      // Downstream browser handler independently verifies JWT and scopes DO by
      // the server-derived tenant, rejecting cross-tenant response payloads.
      return employeeWorker.fetch(request, isolatedEnv as Env, ctx);
    }
  };
}
export default createEMP003StagingEntry();
