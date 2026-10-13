const baseUrl = process.env.WORKFORCE_ADMIN_BASE_URL;
const platformToken = process.env.WORKFORCE_PLATFORM_ADMIN_TOKEN;
const accessId = process.env.CF_ACCESS_CLIENT_ID;
const accessSecret = process.env.CF_ACCESS_CLIENT_SECRET;
if (!baseUrl) throw new Error("WORKFORCE_ADMIN_BASE_URL_REQUIRED");
if (!platformToken || platformToken.length < 32) throw new Error("WORKFORCE_PLATFORM_ADMIN_TOKEN_REQUIRED");
if (Boolean(accessId) !== Boolean(accessSecret)) throw new Error("CF_ACCESS_SERVICE_TOKEN_INCOMPLETE");
const endpoint = new URL("/api/admin/workforce", baseUrl).toString();
const accessHeaders = accessId ? { "CF-Access-Client-Id": accessId, "CF-Access-Client-Secret": accessSecret } : {};
const send = async (token, payload) => {
  const response = await fetch(endpoint, { method: "POST", headers: { ...accessHeaders, "content-type": "application/json", ...(token === undefined ? {} : { "x-herreb-workforce-platform-token": token }) }, body: JSON.stringify(payload) });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { throw new Error(`NON_JSON_RESPONSE:${response.status}:${text.slice(0,120)}`); }
  return { status: response.status, body };
};
const mutation = { type: "tenant.create", tenant: { tenantId: "certification-never-persist", name: "Certification Never Persist" } };
const payload = { mutation };
const invalid = await send(platformToken + "-invalid", payload);
if (invalid.status !== 401 || invalid.body?.ok !== false || invalid.body?.error !== "WORKFORCE_PLATFORM_ADMIN_AUTH_INVALID") throw new Error(`INVALID_PLATFORM_CREDENTIAL_NOT_REJECTED:${invalid.status}`);
const absent = await send(undefined, payload);
if (absent.status !== 401 || absent.body?.persisted !== false) throw new Error(`MISSING_PLATFORM_CREDENTIAL_NOT_REJECTED:${absent.status}`);
const valid = await send(platformToken, payload);
if (valid.status !== 403 || valid.body?.decision !== "YELLOW" || valid.body?.persisted !== false || !valid.body?.auditId) throw new Error(`PLATFORM_YELLOW_GATE_NOT_CONFIRMED:${valid.status}:${JSON.stringify({decision:valid.body?.decision,persisted:valid.body?.persisted,auditIdPresent:Boolean(valid.body?.auditId)})}`);
console.log(JSON.stringify({ok:true,endpoint,invalid:{status:invalid.status},absent:{status:absent.status},valid:{status:valid.status,decision:valid.body.decision,persisted:valid.body.persisted,auditId:valid.body.auditId}},null,2));
