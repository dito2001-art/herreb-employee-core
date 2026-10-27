import { MarketingCampaignBlueprintSchema } from "../core/marketing-campaign-blueprint";
import { CampaignTransitionSchema } from "../core/marketing-campaign-lifecycle";
import { EMP003ReviewStateSchema } from "./emp003-review-state";
import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";

type Store = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};
type Env = Parameters<typeof readWorkforceAdminAccessActor>[1] & {
  EMP003_CAMPAIGN_STATE?: Store;
};
const fail = (status: number, error: string) =>
  Response.json(
    { ok: false, error },
    { status, headers: { "cache-control": "no-store" } }
  );
const safe = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

/** Access-only browser boundary. Scope and actor are never accepted from the caller. */
export async function handleEMP003BrowserCampaign(
  request: Request,
  env: Env,
  fetcher?: typeof fetch
): Promise<Response> {
  const url = new URL(request.url);
  const read =
    request.method === "GET" && url.pathname === "/api/emp003/drafts";
  const review =
    request.method === "POST" && url.pathname === "/api/emp003/review";
  if (!read && !review) return fail(405, "METHOD_NOT_ALLOWED");
  if (
    review &&
    (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin))
  )
    return fail(403, "EMP003_ORIGIN_REJECTED");
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher);
  } catch {
    return fail(401, "EMP003_BROWSER_AUTH_REQUIRED");
  }
  if (
    !safe(actor.tenantId) ||
    (actor.role !== "owner" && actor.role !== "user") ||
    (review && actor.role !== "owner")
  )
    return fail(403, "EMP003_BROWSER_ROLE_FORBIDDEN");
  if (!env.EMP003_CAMPAIGN_STATE)
    return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  let input: Record<string, unknown> = {};
  if (review) {
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return fail(415, "EMP003_JSON_REQUIRED");
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 8192)
        return fail(413, "EMP003_REVIEW_TOO_LARGE");
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return fail(400, "EMP003_REVIEW_INVALID_INPUT");
      input = parsed as Record<string, unknown>;
    } catch {
      return fail(400, "EMP003_REVIEW_INVALID_INPUT");
    }
    if (
      Object.keys(input).some(
        (k) =>
          !["campaignId", "from", "to", "reason", "idempotencyKey"].includes(k)
      )
    )
      return fail(400, "EMP003_REVIEW_UNEXPECTED_FIELD");
  } else if ([...url.searchParams.keys()].some((k) => k !== "campaignId"))
    return fail(400, "EMP003_DRAFT_UNEXPECTED_FIELD");
  const campaignId = read
    ? url.searchParams.get("campaignId")
    : input.campaignId;
  if (!safe(campaignId)) return fail(400, "EMP003_CAMPAIGN_INVALID");
  const stub = env.EMP003_CAMPAIGN_STATE.get(
    env.EMP003_CAMPAIGN_STATE.idFromName(actor.tenantId)
  );
  const destination = new URL("https://emp003-campaign-state.internal/draft");
  destination.searchParams.set("tenantId", actor.tenantId);
  destination.searchParams.set("campaignId", campaignId);
  try {
    const response = await stub.fetch(new Request(destination));
    if (!response.ok) return fail(503, "EMP003_DRAFT_READBACK_FAILED");
    const body = (await response.json()) as Record<string, unknown>;
    if (body.ok !== true || typeof body.found !== "boolean")
      return fail(503, "EMP003_DRAFT_READBACK_FAILED");
    if (!body.found) return fail(404, "EMP003_DRAFT_NOT_FOUND");
    const blueprint = MarketingCampaignBlueprintSchema.safeParse(body.campaign);
    if (
      !blueprint.success ||
      blueprint.data.tenantId !== actor.tenantId ||
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 1
    )
      return fail(503, "EMP003_DRAFT_READBACK_FAILED");
    if (read)
      return Response.json(
        {
          ok: true,
          found: true,
          tenantId: actor.tenantId,
          campaignId,
          campaign: blueprint.data,
          revision: body.revision
        },
        { headers: { "cache-control": "no-store" } }
      );
    const transition = CampaignTransitionSchema.safeParse({
      ...input,
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      actorRole: "owner",
      correlationId: input.idempotencyKey
    });
    if (!transition.success || !safe(input.idempotencyKey))
      return fail(400, "EMP003_REVIEW_INVALID_INPUT");
    destination.pathname = "/transition";
    const result = await stub.fetch(
      new Request(destination, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(transition.data)
      })
    );
    if (!result.ok)
      return fail(
        result.status === 400 || result.status === 409 ? 409 : 503,
        "EMP003_REVIEW_REJECTED"
      );
    const receipt = (await result.json()) as Record<string, unknown>;
    const state = EMP003ReviewStateSchema.safeParse(receipt.state);
    if (
      receipt.ok !== true ||
      receipt.readBackConfirmed !== true ||
      !state.success ||
      state.data.tenantId !== actor.tenantId ||
      state.data.campaignId !== campaignId ||
      state.data.state !== transition.data.to
    )
      return fail(503, "EMP003_REVIEW_READBACK_FAILED");
    destination.pathname = "/review";
    const check = await stub.fetch(new Request(destination));
    if (!check.ok) return fail(503, "EMP003_REVIEW_READBACK_FAILED");
    const persisted = (await check.json()) as Record<string, unknown>;
    const checked = EMP003ReviewStateSchema.safeParse(persisted.state);
    if (
      persisted.ok !== true ||
      persisted.found !== true ||
      !checked.success ||
      JSON.stringify(checked.data) !== JSON.stringify(state.data)
    )
      return fail(503, "EMP003_REVIEW_READBACK_FAILED");
    return Response.json(
      {
        ok: true,
        persisted: true,
        readBackConfirmed: true,
        state: checked.data
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  }
}
