interface Env {
  CALENDAR_READ_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  GOOGLE_CALENDAR_ID?: string;
  CALENDAR_TENANT_ID?: string;
}

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

function unauthorized(message: string, status = 401) {
  return json({ ok: false, error: { code: "UNAUTHORIZED", message } }, status);
}

async function accessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !data.access_token) throw new Error(`GOOGLE_TOKEN_REFRESH_FAILED:${response.status}:${data.error ?? "unknown"}`);
  return data.access_token;
}

async function calendarSearch(url: URL, env: Env, token: string) {
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  if (!timeMin || !timeMax) return json({ ok: false, error: { code: "TIME_RANGE_REQUIRED", message: "timeMin and timeMax are required" } }, 400);
  const calendarId = url.searchParams.get("calendarId") || env.GOOGLE_CALENDAR_ID || "primary";
  const google = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  google.searchParams.set("timeMin", timeMin);
  google.searchParams.set("timeMax", timeMax);
  google.searchParams.set("singleEvents", "true");
  google.searchParams.set("orderBy", "startTime");
  google.searchParams.set("maxResults", "100");
  const query = url.searchParams.get("query");
  if (query) google.searchParams.set("q", query);
  const response = await fetch(google, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  const body = await response.text();
  if (!response.ok) return json({ ok: false, error: { code: "GOOGLE_CALENDAR_UPSTREAM", message: `Google Calendar returned HTTP ${response.status}` } }, response.status);
  const data = JSON.parse(body) as { items?: unknown[]; nextPageToken?: string };
  return json({ ok: true, operation: "search", events: data.items ?? [], nextPageToken: data.nextPageToken ?? null });
}

async function calendarAvailability(url: URL, env: Env, token: string) {
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  if (!timeMin || !timeMax) return json({ ok: false, error: { code: "TIME_RANGE_REQUIRED", message: "timeMin and timeMax are required" } }, 400);
  const ids = url.searchParams.getAll("calendarIds");
  const calendarIds = ids.length ? ids : [env.GOOGLE_CALENDAR_ID || "primary"];
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ timeMin, timeMax, timeZone: url.searchParams.get("timezone") || "America/Asuncion", items: calendarIds.map((id) => ({ id })) })
  });
  const body = await response.text();
  if (!response.ok) return json({ ok: false, error: { code: "GOOGLE_CALENDAR_UPSTREAM", message: `Google Calendar returned HTTP ${response.status}` } }, response.status);
  return new Response(body, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "herreb-calendar-read", mode: "READ_ONLY" });
    if (request.method !== "GET" || url.pathname !== "/calendar/read") return json({ ok: false, error: { code: "NOT_FOUND" } }, 404);

    const expectedTenant = env.CALENDAR_TENANT_ID || "herreb-client-0";
    if (request.headers.get("X-Tenant-ID") !== expectedTenant) return unauthorized("Tenant scope mismatch", 403);
    if (!request.headers.get("X-Correlation-ID")) return json({ ok: false, error: { code: "CORRELATION_ID_REQUIRED" } }, 400);
    if (request.headers.get("authorization") !== `Bearer ${env.CALENDAR_READ_TOKEN}`) return unauthorized("Invalid service token");

    try {
      const token = await accessToken(env);
      const operation = url.searchParams.get("operation");
      if (operation === "search") return calendarSearch(url, env, token);
      if (operation === "availability") return calendarAvailability(url, env, token);
      return json({ ok: false, error: { code: "READ_ONLY_OPERATION_REQUIRED", message: "Only search and availability are supported" } }, 400);
    } catch (error) {
      console.error("CALENDAR_READ_FAILURE", { message: error instanceof Error ? error.message : "unknown" });
      return json({ ok: false, error: { code: "CALENDAR_READ_FAILURE", message: "Calendar read failed" } }, 502);
    }
  }
} satisfies ExportedHandler<Env>;
