interface Env {
  CALENDAR_READ_TOKEN: string;
  CALENDAR_TENANT_ID?: string;
  CRM_CALENDAR_BRIDGE_URL?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

function unauthorized(message: string, status = 401) {
  return json({ ok: false, error: { code: "UNAUTHORIZED", message } }, status);
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);

/**
 * READ_ONLY compatibility proxy for EMP-002.
 *
 * Google OAuth is intentionally owned by the production CRM bridge. This
 * worker preserves the existing CALENDAR_READ service binding contract while
 * forwarding authenticated, tenant-scoped reads to that bridge. It never
 * stores or refreshes Google OAuth credentials and never exposes a write path.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "herreb-calendar-read",
        mode: "READ_ONLY",
        oauthOwner: "crm-bridge"
      });
    }

    if (request.method !== "GET" || url.pathname !== "/calendar/read") {
      return json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }

    const expectedTenant = env.CALENDAR_TENANT_ID || "herreb-client-0";
    const tenantId = request.headers.get("X-Tenant-ID");
    const correlationId = request.headers.get("X-Correlation-ID");
    const authorization = request.headers.get("authorization");

    if (tenantId !== expectedTenant) return unauthorized("Tenant scope mismatch", 403);
    if (!correlationId) {
      return json({ ok: false, error: { code: "CORRELATION_ID_REQUIRED" } }, 400);
    }
    if (!env.CALENDAR_READ_TOKEN || authorization !== `Bearer ${env.CALENDAR_READ_TOKEN}`) {
      return unauthorized("Invalid service token");
    }

    const operation = url.searchParams.get("operation");
    if (operation !== "search" && operation !== "availability") {
      return json(
        {
          ok: false,
          error: {
            code: "READ_ONLY_OPERATION_REQUIRED",
            message: "Only search and availability are supported"
          }
        },
        400
      );
    }

    const bridgeBase = env.CRM_CALENDAR_BRIDGE_URL?.trim() || "https://crm.herreb.com/calendar/read";
    const upstream = new URL(bridgeBase);
    upstream.search = url.search;

    try {
      const response = await fetch(upstream.toString(), {
        method: "GET",
        headers: {
          authorization,
          "X-Tenant-ID": tenantId,
          "X-Correlation-ID": correlationId,
          accept: "application/json"
        },
        redirect: "manual"
      });

      const headers = new Headers(response.headers);
      for (const header of HOP_BY_HOP) headers.delete(header);
      headers.set("cache-control", "no-store");
      headers.set("X-HerreB-Calendar-Proxy", "crm-bridge");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error("CRM_CALENDAR_BRIDGE_FAILURE", {
        correlationId,
        tenantId,
        message: error instanceof Error ? error.message : "unknown"
      });
      return json(
        {
          ok: false,
          error: {
            code: "CRM_CALENDAR_BRIDGE_FAILURE",
            message: "Calendar bridge request failed"
          }
        },
        502
      );
    }
  }
} satisfies ExportedHandler<Env>;
