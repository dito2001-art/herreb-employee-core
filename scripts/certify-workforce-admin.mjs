const baseUrl = process.env.WORKFORCE_ADMIN_BASE_URL;
const accessEmail = process.env.WORKFORCE_ADMIN_ACCESS_EMAIL;

if (!baseUrl) throw new Error("WORKFORCE_ADMIN_BASE_URL_REQUIRED");

const endpoint = new URL("/api/admin/workforce", baseUrl).toString();
const headers = accessEmail
  ? { "cf-access-authenticated-user-email": accessEmail }
  : {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`NON_JSON_RESPONSE:${response.status}:${text.slice(0, 300)}`);
  }
}

const getResponse = await fetch(endpoint, { headers });
const initial = await json(getResponse);
assert(getResponse.ok, `ADMIN_GET_FAILED:${getResponse.status}:${JSON.stringify(initial)}`);
assert(initial?.ok === true, "ADMIN_GET_NOT_OK");
assert(Array.isArray(initial?.state?.manifests), "ADMIN_MANIFESTS_MISSING");
assert(Array.isArray(initial?.state?.identities), "ADMIN_IDENTITIES_MISSING");

const unauthorized = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    actor: { actorId: "spoof", tenantId: "spoof", role: "owner" },
    mutation: {
      type: "identity.delete",
      email: "nonexistent-certification@example.invalid"
    }
  })
});
const unauthorizedBody = await json(unauthorized);
assert(unauthorized.status === 401, `ADMIN_UNAUTH_WRITE_NOT_REJECTED:${unauthorized.status}`);
assert(unauthorizedBody?.persisted === false, "ADMIN_UNAUTH_WRITE_PERSISTED");

let controlledWrite = null;
if (accessEmail) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      mutation: {
        type: "identity.delete",
        email: "nonexistent-certification@example.invalid"
      }
    })
  });
  const body = await json(response);
  assert(response.ok, `ADMIN_CONTROLLED_WRITE_FAILED:${response.status}:${JSON.stringify(body)}`);
  assert(body?.decision === "GREEN", `ADMIN_DECISION_NOT_GREEN:${body?.decision}`);
  assert(body?.persisted === true, "ADMIN_WRITE_NOT_PERSISTED");
  assert(typeof body?.auditId === "string" && body.auditId.length > 0, "ADMIN_AUDIT_ID_MISSING");
  assert(Array.isArray(body?.state?.manifests), "ADMIN_WRITE_READBACK_MISSING");
  controlledWrite = { decision: body.decision, persisted: body.persisted, auditId: body.auditId };
}

console.log(JSON.stringify({
  ok: true,
  endpoint,
  get: { status: getResponse.status, manifests: initial.state.manifests.length, identities: initial.state.identities.length },
  unauthorizedWrite: { status: unauthorized.status, persisted: unauthorizedBody.persisted },
  controlledWrite
}, null, 2));
