import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { handleEMP003BrowserOperations, handleEMP003BrowserDraftSave } from "./emp003-browser-operations";
const tenantId = "herreb-client-0";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const blueprint = { tenantId, correlationId: "corr", objective: "Generate B2B demand", audiences: ["buyers"], positioning: "reliable", keyMessages: ["value"], channels: [{ name: "Email", actions: ["Prepare a draft"] }], kpis: [{ metric: "leads", target: "10", measurement: "CRM" }], assumptions: [], evidenceRefs: ["https://example.com"], status: "DRAFT", publishApproved: false };
const campaign = () => ({ campaignId: "campaign-1", blueprint: { ...blueprint }, reviewState: "DRAFT", reviewRevision: 1, requiresOwnerReview: true, publishAuthorized: false, publishExecuted: false });
const payload = () => ({ ok: true, tenantId, campaigns: [campaign()] });
async function setup(data: unknown = payload()) {
 const pair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign","verify"]);
 const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
 let storedDraft: unknown = blueprint;
 const env = { WORKFORCE_ACCESS_TEAM_DOMAIN: "herreb.cloudflareaccess.com", WORKFORCE_ACCESS_AUDIENCE: "aud-client-0", ACCESS_IDENTITY_MAP_JSON: JSON.stringify([{ email: "owner@example.com", actorId: "owner", tenantId, role: "owner" }]), EMP003_CAMPAIGN_STATE: { idFromName: (id: string) => id, get: () => ({ fetch: async (request: Request) => { const url = new URL(request.url); if (url.pathname === "/operations") return Response.json(data); if (url.pathname === "/review") return Response.json({ ok: true, found: false, state: null }); if (url.pathname === "/draft" && request.method === "POST") { const value = await request.json(); storedDraft = value; return Response.json({ ok: true, persisted: true, campaign: value }); } if (url.pathname === "/draft" && request.method === "GET") return Response.json({ ok: true, found: true, campaign: storedDraft }); return Response.json({ ok: false }, { status: 404 }); } }) } };
 const fetcher = (async () => Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] })) as typeof fetch;
 const now = Math.floor(Date.now()/1000);
 const signed = b64({ alg: "RS256", kid: "k1" })+"."+b64({ email:"owner@example.com",iss:"https://herreb.cloudflareaccess.com",aud:"aud-client-0",iat:now-10,exp:now+3600 });
 const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(signed));
 const request = new Request("https://employee.herreb.com/api/emp003/operations",{headers:{"cf-access-jwt-assertion":signed+"."+Buffer.from(signature).toString("base64url")}});
 return {env,fetcher,request};
}
test("accepts validated tenant-scoped campaigns", async()=>{const {env,fetcher,request}=await setup();const res=await handleEMP003BrowserOperations(request,env,fetcher);assert.equal(res.status,200);assert.equal(res.headers.get("cache-control"),"no-store");const body=await res.json() as {tenantId:string;campaigns:unknown[]};assert.equal(body.tenantId,tenantId);assert.equal(body.campaigns.length,1);});
test("rejects cross-tenant campaigns",async()=>{const bad=payload();bad.campaigns[0].blueprint.tenantId="another-tenant";const {env,fetcher,request}=await setup(bad);assert.equal((await handleEMP003BrowserOperations(request,env,fetcher)).status,503);});
test("rejects duplicate campaign IDs",async()=>{const bad=payload();bad.campaigns.push(campaign());const {env,fetcher,request}=await setup(bad);assert.equal((await handleEMP003BrowserOperations(request,env,fetcher)).status,503);});
test("rejects inconsistent review flags",async()=>{const bad=payload();bad.campaigns[0].requiresOwnerReview=false;const {env,fetcher,request}=await setup(bad);assert.equal((await handleEMP003BrowserOperations(request,env,fetcher)).status,503);});
test("rejects forged publication authorization",async()=>{const bad=payload() as unknown as {campaigns:Array<Record<string,unknown>>};bad.campaigns[0].publishAuthorized=true;const {env,fetcher,request}=await setup(bad);assert.equal((await handleEMP003BrowserOperations(request,env,fetcher)).status,503);});
test("requires signed Access JWT",async()=>{const {env,fetcher,request}=await setup();assert.equal((await handleEMP003BrowserOperations(new Request(request.url),env,fetcher)).status,401);});

test("owner can save a tenant-scoped draft only after persistent readback", async () => {
 const { env, fetcher, request } = await setup();
 const input = { campaignId: "new-campaign", blueprint: { ...blueprint, objective: "Edited HerreB growth campaign", tenantId: "client-supplied-other-tenant" } };
 const saveRequest = new Request("https://employee.herreb.com/api/emp003/drafts", { method: "POST", headers: { "cf-access-jwt-assertion": request.headers.get("cf-access-jwt-assertion")!, "content-type": "application/json" }, body: JSON.stringify(input) });
 const response = await handleEMP003BrowserDraftSave(saveRequest, env, fetcher);
 assert.equal(response.status, 200);
 const result = await response.json() as { tenantId: string; persisted: boolean; readBackConfirmed: boolean; publishExecuted: boolean; blueprint: { tenantId: string; objective: string } };
 assert.equal(result.tenantId, tenantId);
 assert.equal(result.blueprint.tenantId, tenantId);
 assert.equal(result.blueprint.objective, "Edited HerreB growth campaign");
 assert.equal(result.persisted, true);
 assert.equal(result.readBackConfirmed, true);
 assert.equal(result.publishExecuted, false);
});
test("draft save rejects invalid campaign identifiers and invalid blueprints", async () => {
 const { env, fetcher, request } = await setup();
 const auth = request.headers.get("cf-access-jwt-assertion")!;
 const badId = await handleEMP003BrowserDraftSave(new Request("https://employee.herreb.com/api/emp003/drafts", { method:"POST", headers:{"cf-access-jwt-assertion":auth,"content-type":"application/json"}, body:JSON.stringify({campaignId:"../escape",blueprint}) }),env,fetcher);
 assert.equal(badId.status,400);
 const badBlueprint = await handleEMP003BrowserDraftSave(new Request("https://employee.herreb.com/api/emp003/drafts", { method:"POST", headers:{"cf-access-jwt-assertion":auth,"content-type":"application/json"}, body:JSON.stringify({campaignId:"campaign-2",blueprint:{...blueprint,audiences:[]}}) }),env,fetcher);
 assert.equal(badBlueprint.status,400);
});
test("draft save requires verified Access identity", async () => {
 const { env, fetcher } = await setup();
 const response = await handleEMP003BrowserDraftSave(new Request("https://employee.herreb.com/api/emp003/drafts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({campaignId:"campaign-3",blueprint})}),env,fetcher);
 assert.equal(response.status,401);
});
