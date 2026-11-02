import { CopyBrandViewSchema } from "../core/emp003-copy-lifecycle-contracts";
import {
  CopyEditInput,
  CopyApproveInput,
  CopyApprovalSchema
} from "./emp003-copy-lifecycle";
import { CopyGenerateInput, CopyId } from "./emp003-copy-context";
import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
import { MarketingAssetVersionSchema } from "../core/marketing-asset-library";

type Namespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};
type CopyEnv = Parameters<typeof readWorkforceAdminAccessActor>[1] & {
  EMP003_CAMPAIGN_STATE?: Namespace;
};
const reply = (status: number, error: string) =>
  Response.json(
    { ok: false, error },
    { status, headers: { "cache-control": "private, no-store" } }
  );
export async function handleEMP003CopyAssets(
  request: Request,
  env: CopyEnv,
  fetcher?: typeof fetch
) {
  const url = new URL(request.url);
  const generate =
    request.method === "POST" && url.pathname === "/api/emp003/assets/generate";
  const edit =
    request.method === "POST" && url.pathname === "/api/emp003/assets/edit";
  const approve =
    request.method === "POST" && url.pathname === "/api/emp003/assets/approve";
  const mutation = generate || edit || approve;
  const brand = url.pathname === "/api/emp003/assets/brand-brain";
  if (
    !mutation &&
    !(
      request.method === "GET" &&
      [
        "/api/emp003/assets",
        "/api/emp003/assets/content",
        "/api/emp003/assets/context",
        "/api/emp003/assets/status",
        "/api/emp003/assets/approval",
        "/api/emp003/assets/brand-brain"
      ].includes(url.pathname)
    )
  )
    return reply(405, "METHOD_NOT_ALLOWED");
  if (
    mutation &&
    (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin))
  )
    return reply(403, "COPY_ORIGIN_REJECTED");
  let actor;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher);
  } catch {
    return reply(401, "COPY_ACCESS_REQUIRED");
  }
  if (
    !CopyId.safeParse(actor.tenantId).success ||
    !["owner", "user"].includes(actor.role) ||
    (mutation && actor.role !== "owner")
  )
    return reply(403, "COPY_ROLE_FORBIDDEN");
  if (!env.EMP003_CAMPAIGN_STATE) return reply(503, "COPY_STORAGE_UNAVAILABLE");
  const target = new URL(
    "https://emp003-campaign-state.internal" +
      url.pathname.replace("/api/emp003/assets", "/copy-assets")
  );
  target.searchParams.set("tenantId", actor.tenantId!);
  let body: string | undefined;
  try {
    if (mutation) {
      if (
        !request.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        return reply(415, "COPY_JSON_REQUIRED");
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > (edit ? 65536 : 8192))
        return reply(413, "COPY_INPUT_TOO_LARGE");
      const input = (
        edit ? CopyEditInput : approve ? CopyApproveInput : CopyGenerateInput
      ).parse(JSON.parse(raw));
      body = JSON.stringify(input);
      target.searchParams.set("campaignId", input.campaignId);
      if (url.search) return reply(400, "COPY_INPUT_INVALID");
    } else {
      const allowed = brand
        ? ["revision"]
        : url.pathname.endsWith("/content") ||
            url.pathname.endsWith("/approval")
          ? ["campaignId", "assetId", "revision"]
          : url.pathname.endsWith("/status")
            ? ["campaignId", "operationId"]
            : ["campaignId"];
      if (
        [...url.searchParams.keys()].some(
          (x) => !allowed.includes(x) || url.searchParams.getAll(x).length !== 1
        )
      )
        return reply(400, "COPY_INPUT_INVALID");
      for (const key of allowed) {
        const value = url.searchParams.get(key);
        if (key === "revision") {
          if (
            value !== null &&
            (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
          )
            throw Error();
        } else CopyId.parse(value);
        if (value !== null) target.searchParams.set(key, value);
      }
    }
  } catch {
    return reply(400, "COPY_INPUT_INVALID");
  }
  try {
    const response = await env.EMP003_CAMPAIGN_STATE.get(
      env.EMP003_CAMPAIGN_STATE.idFromName(actor.tenantId!)
    ).fetch(
      new Request(target, {
        method: request.method,
        headers: mutation
          ? {
              "content-type": "application/json",
              "x-emp003-copy-actor": actor.actorId ?? ""
            }
          : {},
        body
      })
    );
    if (url.pathname.endsWith("/content") && response.ok) {
      if (
        response.headers.get("x-emp003-tenant") !== actor.tenantId ||
        response.headers.get("content-type") !== "text/plain; charset=utf-8" ||
        !/^[a-f0-9]{64}$/.test(response.headers.get("x-content-sha256") ?? "")
      )
        return reply(503, "COPY_READBACK_INVALID");
      return new Response(response.body, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "x-content-sha256": response.headers.get("x-content-sha256")!,
          "x-asset-revision": response.headers.get("x-asset-revision") ?? ""
        }
      });
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (response.ok) {
      if (brand) {
        const view = CopyBrandViewSchema.parse(data);
        if (
          view.tenantId !== actor.tenantId ||
          view.brand.tenantId !== actor.tenantId
        )
          throw Error();
      }
      if (data.approval) {
        const approval = CopyApprovalSchema.parse(data.approval);
        if (
          approval.tenantId !== actor.tenantId ||
          approval.campaignId !== target.searchParams.get("campaignId") ||
          approval.assetId !==
            (body
              ? JSON.parse(body).assetId
              : target.searchParams.get("assetId")) ||
          approval.revision !==
            (body
              ? JSON.parse(body).revision
              : Number(target.searchParams.get("revision")))
        )
          throw Error();
      }
      const records = Array.isArray(data.assets)
        ? data.assets
        : data.record
          ? [data.record]
          : [];
      for (const raw of records) {
        const item = MarketingAssetVersionSchema.parse(raw);
        if (
          item.tenantId !== actor.tenantId ||
          item.campaignId !== target.searchParams.get("campaignId")
        )
          throw Error();
      }
    }
    return Response.json(
      {
        ...data,
        permissions: {
          canGenerate: actor.role === "owner",
          canEdit: actor.role === "owner",
          canApprove: actor.role === "owner"
        }
      },
      {
        status: response.status,
        headers: { "cache-control": "private, no-store" }
      }
    );
  } catch {
    return reply(503, "COPY_STORAGE_UNAVAILABLE");
  }
}
