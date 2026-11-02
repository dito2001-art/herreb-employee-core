import { resolvePersistedWorkforceActor } from "../runtime/workforce-persisted-actor";

interface GatewayEnv {
  INTEGRATED: { fetch(request: Request): Promise<Response> };
  STAGING_ACCESS_TEAM_DOMAIN?: string;
  STAGING_ACCESS_AUDIENCE?: string;
  WORKFORCE_CORE?: { fetch(request: Request): Promise<Response> };
}

const methods = new Map<string, ReadonlySet<string>>([
  ...["", "/content", "/context", "/status", "/approval", "/brand-brain"].map(
    (suffix): [string, ReadonlySet<string>] => ["/api/emp003/assets" + suffix, new Set(["GET"])]
  ),
  ...["/generate", "/edit", "/approve"].map(
    (suffix): [string, ReadonlySet<string>] => ["/api/emp003/assets" + suffix, new Set(["POST"])]
  ),
  ["/api/emp001/operations", new Set(["GET"])],
  ["/api/emp002/calendar", new Set(["POST"])],
  ["/api/emp003/operations", new Set(["GET"])],
  ["/api/emp003/review", new Set(["GET", "POST"])],
  ["/api/emp003/drafts", new Set(["GET", "POST"])],
  ["/api/emp003/generate-campaign", new Set(["POST"])]
]);
const assetPath = (path: string) =>
  path === "/" || path === "/index.html" ||
  /^\/assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$/.test(path);
const deny = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

/** Dedicated HTTP-only Access ingress. Never forwards client-controlled identity or internal headers. */
export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.has("upgrade") ||
      request.headers.get("connection")?.toLowerCase().includes("upgrade"))
      return deny(403, "GATEWAY_UPGRADE_DENIED");
    if (request.method === "POST" &&
      (request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.has("origin") && request.headers.get("origin") !== url.origin)))
      return deny(403, "GATEWAY_ORIGIN_DENIED");
    const isAsset = (request.method === "GET" || request.method === "HEAD") && assetPath(url.pathname);
    if (!methods.get(url.pathname)?.has(request.method) && !isAsset)
      return deny(404, "GATEWAY_ROUTE_DISABLED");
    if (!env.INTEGRATED || !env.STAGING_ACCESS_TEAM_DOMAIN ||
      !env.STAGING_ACCESS_AUDIENCE || !env.WORKFORCE_CORE)
      return deny(503, "GATEWAY_NOT_CONFIGURED");

    try {
      const actor = await resolvePersistedWorkforceActor(request, env);
      const employee = url.pathname.startsWith("/api/emp001/") ? "EMP-001" :
        url.pathname.startsWith("/api/emp002/") ? "EMP-002" :
        url.pathname.startsWith("/api/emp003/") ? "EMP-003" : undefined;
      if (employee && !actor.enabledEmployees.includes(employee))
        return deny(403, "GATEWAY_EMPLOYEE_DISABLED");
      if (!actor.actorId || !actor.tenantId || !["owner", "user"].includes(actor.role))
        return deny(403, "GATEWAY_ACTOR_FORBIDDEN");
    } catch {
      return deny(401, "GATEWAY_ACCESS_DENIED");
    }

    // A newly constructed header set prevents client-supplied internal capability,
    // tenant, email and proxy identity headers from crossing the service boundary.
    const headers = new Headers();
    headers.set("cf-access-jwt-assertion", request.headers.get("cf-access-jwt-assertion")!);
    for (const name of ["accept", "content-type", "if-match", "if-none-match", "idempotency-key"]) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const forwarded = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual"
    });
    // Keep original host in URL; the integrated worker independently verifies
    // the same Access JWT and resolves tenant through the same persisted Core authority.
    const response = await env.INTEGRATED.fetch(forwarded);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  }
};
