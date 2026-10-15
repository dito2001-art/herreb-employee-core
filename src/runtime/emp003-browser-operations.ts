import { EMP003CampaignOperationsResponseSchema } from "../core/emp003-campaign-review-ui-model";
import { MarketingCampaignBlueprintSchema } from "../core/marketing-campaign-blueprint";
import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";

type CampaignStore = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};
type AccessEnv = Parameters<typeof readWorkforceAdminAccessActor>[1] & { EMP003_CAMPAIGN_STATE?: CampaignStore };
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

/** Browser read access: JWT-verified identity, server-derived tenant, no client token or publishing. */
export async function handleEMP003BrowserOperations(request: Request, env: AccessEnv, fetcher?: typeof fetch): Promise<Response> {
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try { actor = await readWorkforceAdminAccessActor(request, env, fetcher); }
  catch { return fail(401, "EMP003_BROWSER_AUTH_REQUIRED"); }
  if (actor.role !== "owner" && actor.role !== "user") return fail(403, "EMP003_BROWSER_ROLE_FORBIDDEN");
  const tenantId = actor.tenantId;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId)) return fail(403, "EMP003_BROWSER_TENANT_FORBIDDEN");
  if (!env.EMP003_CAMPAIGN_STATE) return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  try {
    const destination = new URL("https://emp003-campaign-state.internal/operations");
    destination.searchParams.set("tenantId", tenantId);
    const stub = env.EMP003_CAMPAIGN_STATE.get(env.EMP003_CAMPAIGN_STATE.idFromName(tenantId));
    const response = await stub.fetch(new Request(destination, { method: "GET" }));
    if (!response.ok) return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
    const payload: unknown = await response.json();
    const parsed = EMP003CampaignOperationsResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.tenantId !== tenantId ||
      parsed.data.campaigns.some(item => item.blueprint.tenantId !== tenantId) ||
      new Set(parsed.data.campaigns.map(item => item.campaignId)).size !== parsed.data.campaigns.length ||
      parsed.data.campaigns.some(item => item.requiresOwnerReview !== (item.reviewState === "DRAFT" || item.reviewState === "IN_REVIEW")))
      return fail(503, "EMP003_BROWSER_SCOPE_INVALID");
    return Response.json(parsed.data, { headers: { "cache-control": "no-store" } });
  } catch { return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE"); }
}


/** Owner-only draft create/update. Tenant comes only from the verified Access identity. */
export async function handleEMP003BrowserDraftSave(request: Request, env: AccessEnv, fetcher?: typeof fetch): Promise<Response> {
  if (!["GET", "POST"].includes(request.method)) return fail(405, "METHOD_NOT_ALLOWED");
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try { actor = await readWorkforceAdminAccessActor(request, env, fetcher); }
  catch { return fail(401, "EMP003_BROWSER_AUTH_REQUIRED"); }
  if (request.method === "POST" && actor.role !== "owner") return fail(403, "EMP003_BROWSER_OWNER_REQUIRED");
  if (request.method === "GET" && actor.role !== "owner" && actor.role !== "user") return fail(403, "EMP003_BROWSER_ROLE_FORBIDDEN");
  const tenantId = actor.tenantId;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId)) return fail(403, "EMP003_BROWSER_TENANT_FORBIDDEN");
  if (!env.EMP003_CAMPAIGN_STATE) return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  if (request.method === "GET") {
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? "";
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(campaignId)) return fail(400, "EMP003_DRAFT_ID_INVALID");
    try {
      const destination = new URL("https://emp003-campaign-state.internal/draft");
      destination.searchParams.set("tenantId", tenantId);
      destination.searchParams.set("campaignId", campaignId);
      const stub = env.EMP003_CAMPAIGN_STATE.get(env.EMP003_CAMPAIGN_STATE.idFromName(tenantId));
      const response = await stub.fetch(new Request(destination, { method: "GET" }));
      if (!response.ok) return fail(503, "EMP003_DRAFT_READBACK_FAILED");
      return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch { return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE"); }
  }
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail(400, "EMP003_DRAFT_JSON_INVALID"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail(400, "EMP003_DRAFT_INPUT_INVALID");
  const input = raw as Record<string, unknown>;
  const campaignId = typeof input.campaignId === "string" ? input.campaignId : "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(campaignId)) return fail(400, "EMP003_DRAFT_ID_INVALID");
  const blueprint = MarketingCampaignBlueprintSchema.safeParse({ ...(input.blueprint as Record<string, unknown>), tenantId });
  if (!blueprint.success) return fail(400, "EMP003_DRAFT_VALIDATION_FAILED");
  if (!env.EMP003_CAMPAIGN_STATE) return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  try {
    const stub = env.EMP003_CAMPAIGN_STATE.get(env.EMP003_CAMPAIGN_STATE.idFromName(tenantId));
    const reviewUrl = new URL("https://emp003-campaign-state.internal/review");
    reviewUrl.searchParams.set("tenantId", tenantId);
    reviewUrl.searchParams.set("campaignId", campaignId);
    const reviewResponse = await stub.fetch(new Request(reviewUrl, { method: "GET" }));
    if (!reviewResponse.ok) return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
    const review = await reviewResponse.json() as { found?: boolean; state?: { state?: string } | null };
    if (review.found && review.state?.state !== "DRAFT") return fail(409, "EMP003_REVIEWED_DRAFT_IMMUTABLE");
    const destination = new URL("https://emp003-campaign-state.internal/draft");
    destination.searchParams.set("tenantId", tenantId);
    destination.searchParams.set("campaignId", campaignId);
    const savedResponse = await stub.fetch(new Request(destination, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(blueprint.data)
    }));
    if (!savedResponse.ok) return fail(savedResponse.status === 400 ? 409 : 503, "EMP003_DRAFT_SAVE_REJECTED");
    const saved = await savedResponse.json() as { campaign?: unknown };
    const readUrl = new URL(destination);
    const readResponse = await stub.fetch(new Request(readUrl, { method: "GET" }));
    if (!readResponse.ok) return fail(503, "EMP003_DRAFT_READBACK_FAILED");
    const readback = await readResponse.json() as { found?: boolean; campaign?: unknown };
    if (!readback.found || JSON.stringify(readback.campaign) !== JSON.stringify(blueprint.data) ||
        JSON.stringify(saved.campaign) !== JSON.stringify(blueprint.data)) return fail(503, "EMP003_DRAFT_READBACK_MISMATCH");
    return Response.json({ ok: true, tenantId, campaignId, blueprint: readback.campaign, persisted: true, readBackConfirmed: true, publishExecuted: false }, { headers: { "cache-control": "no-store" } });
  } catch { return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE"); }
}
