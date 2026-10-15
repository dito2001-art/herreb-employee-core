import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
import { buildEMP003ReviewCards } from "../core/emp003-campaign-review-ui-model";

type CampaignStore = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};

type AccessEnv = Parameters<typeof readWorkforceAdminAccessActor>[1] & {
  EMP003_CAMPAIGN_STATE?: CampaignStore;
};

const fail = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

/** Browser read access: JWT-verified identity, server-derived tenant, no client token or publishing. */
export async function handleEMP003BrowserOperations(
  request: Request,
  env: AccessEnv,
  fetcher?: typeof fetch
): Promise<Response> {
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher);
  } catch {
    return fail(401, "EMP003_BROWSER_AUTH_REQUIRED");
  }
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
    try {
      buildEMP003ReviewCards(payload, tenantId);
    } catch {
      return fail(503, "EMP003_BROWSER_SCOPE_INVALID");
    }
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch {
    return fail(503, "EMP003_BROWSER_STORAGE_UNAVAILABLE");
  }
}
