/** Non-destructive certification for the Cloudflare Access JWT-protected admin read endpoint. */
const baseUrl = process.env.WORKFORCE_ADMIN_BASE_URL;
if (!baseUrl) throw new Error("WORKFORCE_ADMIN_BASE_URL_REQUIRED");
const endpoint = new URL("/api/admin/workforce", baseUrl).toString();
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error("CF_ACCESS_SERVICE_TOKEN_INCOMPLETE");
const headers = clientId ? { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret } : {};
const response = await fetch(endpoint, { method: "GET", headers, redirect: "error" });
const body = await response.json().catch(() => null);
const result = { endpoint, status: response.status, error: body?.error ?? null, snapshotPresent: Boolean(body?.snapshot) };
console.log(JSON.stringify(result, null, 2));
if (response.status === 503 && body?.error === "WORKFORCE_ADMIN_AUTH_UNAVAILABLE") {
  throw new Error("ACCESS_CONFIGURATION_UNAVAILABLE: verify Worker WORKFORCE_ACCESS_TEAM_DOMAIN and WORKFORCE_ACCESS_AUDIENCE, and Access JWT issuance");
}
if (response.status === 401 && body?.error === "WORKFORCE_ADMIN_AUTH_REQUIRED") {
  throw new Error("ACCESS_JWT_REQUIRED: Cloudflare Access service-token headers do not substitute for cf-access-jwt-assertion; certify with an authorized JWT-bearing identity");
}
if (!response.ok || body?.ok !== true || !Array.isArray(body?.snapshot?.tenants) || !body?.snapshot?.totals) {
  throw new Error(`ADMIN_READ_CERTIFICATION_FAILED:${response.status}:${body?.error ?? "INVALID_SNAPSHOT"}`);
}
if ("state" in body) throw new Error("ADMIN_RAW_STATE_EXPOSED");
if (response.headers.get("cache-control") !== "no-store") throw new Error("ADMIN_CACHE_CONTROL_MISSING");
console.log("ADMIN_READ_CERTIFIED_NON_DESTRUCTIVE");
