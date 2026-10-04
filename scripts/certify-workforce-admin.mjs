const baseUrl = process.env.WORKFORCE_ADMIN_BASE_URL;
const m2mToken = process.env.WORKFORCE_ADMIN_M2M_TOKEN;
if (!baseUrl) throw new Error("WORKFORCE_ADMIN_BASE_URL_REQUIRED");
if (!m2mToken) throw new Error("WORKFORCE_ADMIN_M2M_TOKEN_REQUIRED");
const endpoint = new URL("/api/admin/workforce", baseUrl).toString();
function assert(condition, message) { if (!condition) throw new Error(message); }
async function json(response) { const text = await response.text(); try { return JSON.parse(text); } catch { throw new Error(`NON_JSON_RESPONSE:${response.status}:${text.slice(0,300)}`); } }
function runtimeProbe(response) { return {
  marker: response.headers.get("x-herreb-runtime-marker"),
  m2mAuthenticated: response.headers.get("x-herreb-m2m-authenticated"),
  actorResolved: response.headers.get("x-herreb-actor-resolved"),
  internalContextSent: response.headers.get("x-herreb-internal-context-sent"),
  doInternalActorReceived: response.headers.get("x-herreb-do-internal-actor-received"),
  doInternalTenantReceived: response.headers.get("x-herreb-do-internal-tenant-received"),
  doInternalRoleReceived: response.headers.get("x-herreb-do-internal-role-received")
}; }
const getResponse = await fetch(endpoint); const initial = await json(getResponse);
assert(getResponse.ok, `ADMIN_GET_FAILED:${getResponse.status}:${JSON.stringify(initial)}`); assert(initial?.ok === true,"ADMIN_GET_NOT_OK"); assert(Array.isArray(initial?.state?.manifests),"ADMIN_MANIFESTS_MISSING"); assert(Array.isArray(initial?.state?.identities),"ADMIN_IDENTITIES_MISSING");
const unauthorized = await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({actor:{actorId:"spoof",tenantId:"spoof",role:"owner"},mutation:{type:"identity.delete",email:"nonexistent-certification@example.invalid"}})}); const unauthorizedBody=await json(unauthorized); assert(unauthorized.status===401,`ADMIN_UNAUTH_WRITE_NOT_REJECTED:${unauthorized.status}`); assert(unauthorizedBody?.persisted===false,"ADMIN_UNAUTH_WRITE_PERSISTED");
const invalidToken=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-herreb-workforce-admin-token":`${m2mToken}-invalid`},body:JSON.stringify({mutation:{type:"identity.delete",email:"nonexistent-certification@example.invalid"}})}); const invalidTokenBody=await json(invalidToken); assert(invalidToken.status===401,`ADMIN_INVALID_TOKEN_NOT_REJECTED:${invalidToken.status}`); assert(invalidTokenBody?.persisted===false,"ADMIN_INVALID_TOKEN_PERSISTED");
const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-herreb-workforce-admin-token":m2mToken},body:JSON.stringify({mutation:{type:"identity.delete",email:"nonexistent-certification@example.invalid"}})}); const body=await json(response); const probe=runtimeProbe(response); console.log(`WORKFORCE_ADMIN_RUNTIME_PROBE:${JSON.stringify(probe)}`); assert(response.ok,`ADMIN_CONTROLLED_WRITE_FAILED:${response.status}:${JSON.stringify(body)}:PROBE:${JSON.stringify(probe)}`); assert(body?.decision==="GREEN",`ADMIN_DECISION_NOT_GREEN:${body?.decision}`); assert(body?.persisted===true,"ADMIN_WRITE_NOT_PERSISTED"); assert(typeof body?.auditId==="string"&&body.auditId.length>0,"ADMIN_AUDIT_ID_MISSING"); assert(Array.isArray(body?.state?.manifests),"ADMIN_WRITE_READBACK_MISSING");
const readBackResponse=await fetch(endpoint); const readBack=await json(readBackResponse); assert(readBackResponse.ok&&readBack?.ok===true,"ADMIN_READBACK_FAILED"); assert(Array.isArray(readBack?.state?.identities),"ADMIN_READBACK_IDENTITIES_MISSING");
console.log(JSON.stringify({ok:true,endpoint,runtimeProbe:probe,get:{status:getResponse.status,manifests:initial.state.manifests.length,identities:initial.state.identities.length},unauthorizedWrite:{status:unauthorized.status,persisted:unauthorizedBody.persisted},invalidM2MWrite:{status:invalidToken.status,persisted:invalidTokenBody.persisted},controlledWrite:{decision:body.decision,persisted:body.persisted,auditId:body.auditId},readBack:{status:readBackResponse.status,identities:readBack.state.identities.length}},null,2));
