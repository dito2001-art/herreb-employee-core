import { MarketingCampaignBlueprintSchema } from "../core/marketing-campaign-blueprint";
import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";

type Store = { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
type Env = Parameters<typeof readWorkforceAdminAccessActor>[1] & { EMP003_CAMPAIGN_STATE?: Store };
const fail = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

/** Staging browser BFF: never forwards caller headers, credentials or tenant selectors to DO. */
export async function handleEMP003BrowserDraftWrite(request: Request, env: Env, fetcher?: typeof fetch): Promise<Response> {
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return fail(415, "EMP003_DRAFT_JSON_REQUIRED");
  const length = request.headers.get("content-length");
  if (length && (!/^[0-9]+$/.test(length) || Number(length) > 65536))
    return fail(413, "EMP003_DRAFT_TOO_LARGE");
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try { actor = await readWorkforceAdminAccessActor(request, env, fetcher); }
  catch { return fail(401, "EMP003_DRAFT_AUTH_REQUIRED"); }
  if (actor.role !== "owner" || !/^[a-zA-Z0-9_-]{1,100}$/.test(actor.tenantId))
    return fail(403, "EMP003_DRAFT_OWNER_REQUIRED");
  if (!env.EMP003_CAMPAIGN_STATE) return fail(503, "EMP003_DRAFT_STORAGE_UNAVAILABLE");
  let raw: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 65536) return fail(413, "EMP003_DRAFT_TOO_LARGE");
    raw = JSON.parse(body);
  } catch { return fail(400, "EMP003_DRAFT_INVALID_JSON"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail(400, "EMP003_DRAFT_INVALID_INPUT");
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(k => !["campaignId", "blueprint", "expectedRevision"].includes(k)))
    return fail(400, "EMP003_DRAFT_UNEXPECTED_FIELD");
  const campaignId = input.campaignId;
  if (typeof campaignId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(campaignId))
    return fail(400, "EMP003_DRAFT_CAMPAIGN_INVALID");
  const parsed = MarketingCampaignBlueprintSchema.safeParse(input.blueprint);
  if (!parsed.success || parsed.data.tenantId !== actor.tenantId)
    return fail(403, "EMP003_DRAFT_SCOPE_REJECTED");
  const stub = env.EMP003_CAMPAIGN_STATE.get(env.EMP003_CAMPAIGN_STATE.idFromName(actor.tenantId));
  const destination = new URL("https://emp003-campaign-state.internal/draft");
  destination.searchParams.set("tenantId", actor.tenantId);
  destination.searchParams.set("campaignId", campaignId);
  // No revision/CAS contract exists for edits yet. Creation is atomic and fail-closed.
  if (input.expectedRevision === undefined) destination.searchParams.set("createOnly", "1");
  else if (typeof input.expectedRevision === "number" && Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 1)
    destination.searchParams.set("expectedRevision", String(input.expectedRevision));
  else return fail(400, "EMP003_DRAFT_REVISION_INVALID");
  try {
    const response = await stub.fetch(new Request(destination, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data)
    }));
    if (!response.ok) return fail(response.status === 409 ? 409 : response.status === 404 ? 404 : 503, "EMP003_DRAFT_WRITE_REJECTED");
    const writeReceipt = await response.json() as { revision?: unknown };
    if (!Number.isSafeInteger(writeReceipt.revision)) return fail(503, "EMP003_DRAFT_WRITE_RECEIPT_INVALID");
    const readBack = await stub.fetch(new Request(destination, { method: "GET" }));
    if (!readBack.ok) return fail(503, "EMP003_DRAFT_READBACK_FAILED");
    const payload: unknown = await readBack.json();
    if (!payload || typeof payload !== "object") return fail(503, "EMP003_DRAFT_READBACK_FAILED");
    const result = payload as Record<string, unknown>;
    const saved = MarketingCampaignBlueprintSchema.safeParse(result.campaign);
    if (result.ok !== true || result.found !== true || result.revision !== writeReceipt.revision || !saved.success ||
        JSON.stringify(saved.data) !== JSON.stringify(parsed.data))
      return fail(503, "EMP003_DRAFT_READBACK_MISMATCH");
    return Response.json({ ok: true, persisted: true, tenantId: actor.tenantId, campaignId, revision: writeReceipt.revision, readBackConfirmed: true },
      { headers: { "cache-control": "no-store" } });
  } catch { return fail(503, "EMP003_DRAFT_STORAGE_UNAVAILABLE"); }
}
