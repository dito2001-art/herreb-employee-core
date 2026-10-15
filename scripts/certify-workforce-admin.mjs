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
if (response.status === 401 && body?.error === "WORKFORCE_ADMIN_AUTH_REQUIRED") {
  console.log("ADMIN_NEGATIVE_CERTIFIED: missing Access JWT rejected; no data exposed");
  process.exit(0);
}
if (response.status === 503 && body?.error === "WORKFORCE_ADMIN_AUTH_UNAVAILABLE") {
  throw new Error("ACCESS_CONFIGURATION_UNAVAILABLE: verify Worker issuer and AUD");
}
if (response.status === 403 && body?.error === "WORKFORCE_ADMIN_READ_FORBIDDEN") {
  throw new Error("ACCESS_READ_FORBIDDEN: service-token request is not an authorized user JWT; verify Cloudflare Access identity delivery separately");
}
throw new Error(`ADMIN_NEGATIVE_CERTIFICATION_UNEXPECTED:${response.status}:${body?.error ?? "UNKNOWN"}`);
