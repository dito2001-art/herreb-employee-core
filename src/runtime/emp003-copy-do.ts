import {
  createEMP003CopyLifecycle,
  CopyEditInput,
  CopyApproveInput,
  brandHeadKey,
  configuredCopyHash
} from "./emp003-copy-lifecycle";
import type { ContentGenerator } from "../core/marketing-content-orchestrator";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { createEMP003AssetObjectStorage } from "./emp003-asset-storage";
import { createEMP003CopyService } from "./emp003-copy-service";
import { createEMP003CopyGenerator } from "./emp003-copy-generator";
import { CopyGenerateInput, CopyId } from "./emp003-copy-context";
import { EMP003ReviewStateSchema } from "./emp003-review-state";
import { reviewKey } from "./emp003-review-transaction";

type CopyBindings = {
  AI?: Ai;
  EMP003_ASSET_BUCKET?: R2Bucket;
  EMP003_COPY_CONTEXTS_JSON?: string;
};
export async function handleEMP003CopyDO(
  request: Request,
  storage: DurableObjectStorage,
  env: CopyBindings,
  generator?: ContentGenerator
) {
  const reply = (status: number, data: unknown) =>
    Response.json(data, { status, headers: { "cache-control": "no-store" } });
  try {
    const url = new URL(request.url);
    const tenantId = CopyId.parse(url.searchParams.get("tenantId"));
    const brand =
      request.method === "GET" && url.pathname === "/copy-assets/brand-brain";
    const campaignId = brand
      ? ""
      : CopyId.parse(url.searchParams.get("campaignId"));
    const edit =
      request.method === "POST" && url.pathname === "/copy-assets/edit";
    const approve =
      request.method === "POST" && url.pathname === "/copy-assets/approve";
    const generate =
      request.method === "POST" && url.pathname === "/copy-assets/generate";
    const input = generate
      ? CopyGenerateInput.parse(await request.json())
      : edit
        ? CopyEditInput.parse(await request.json())
        : approve
          ? CopyApproveInput.parse(await request.json())
          : undefined;
    if (input && input.campaignId !== campaignId)
      throw Error("COPY_CONTEXT_SCOPE_REJECTED");
    if (!env.EMP003_ASSET_BUCKET)
      return reply(503, {
        ok: false,
        error: "COPY_BUCKET_NOT_CONFIGURED",
        retrySafe: true
      });
    const repo = createPersistentBlueprintRepository(
      createEMP003DurableStorageAdapter(storage)
    );
    const dependencies = {
      contextJson: env.EMP003_COPY_CONTEXTS_JSON,
      actorId: request.headers.get("x-emp003-copy-actor") ?? undefined,
      objects: createEMP003AssetObjectStorage(env.EMP003_ASSET_BUCKET),
      metadata: {
        transaction<T>(
          work: (
            s: import("../core/campaign-persistent").CampaignStorage
          ) => Promise<T>
        ) {
          return storage.transaction(async (txn) => {
            const adapter = createEMP003DurableStorageAdapter(txn);
            return work({
              ...adapter,
              async put(key, value) {
                if (
                  input &&
                  (key.startsWith(`emp003:assets:${tenantId}:${campaignId}:`) ||
                    key.startsWith(
                      `emp003:asset-approvals:${tenantId}:${campaignId}:`
                    ) ||
                    key ===
                      `emp003:asset-approval-ops:${tenantId}:${input.operationId}` ||
                    ((key ===
                      `emp003:copy:${tenantId}:op:${input.operationId}` ||
                      key ===
                        `emp003:copy-edits:${tenantId}:op:${input.operationId}`) &&
                      JSON.parse(value).state === "STARTED"))
                ) {
                  const profileRaw = await adapter.get(brandHeadKey(tenantId));
                  const profileHead = profileRaw
                    ? (JSON.parse(profileRaw) as { hash: string })
                    : undefined;
                  if (
                    profileHead &&
                    profileHead.hash !==
                      (await configuredCopyHash(
                        env.EMP003_COPY_CONTEXTS_JSON,
                        tenantId
                      ))
                  )
                    throw Error("COPY_BRAND_REVISION_CONFLICT");
                  if (
                    edit &&
                    key.startsWith(
                      `emp003:assets:${tenantId}:${campaignId}:`
                    ) &&
                    (await txn.get(
                      `emp003:copy:${tenantId}:asset:${campaignId}:${input.assetId}`
                    )) !== input.operationId
                  )
                    throw Error("COPY_RECOVERY_LOCK_CONFLICT");
                  const review = await txn.get<unknown>(
                    reviewKey(tenantId, campaignId)
                  );
                  if (
                    review &&
                    EMP003ReviewStateSchema.parse(review).state !== "DRAFT"
                  )
                    throw Error("COPY_CAMPAIGN_IMMUTABLE");
                  if (
                    ((await txn.get<number>(
                      `emp003:draft-revision:${tenantId}:${campaignId}`
                    )) ?? 1) !== input.campaignRevision
                  )
                    throw Error("COPY_CAMPAIGN_REVISION_CONFLICT");
                }
                return adapter.put(key, value);
              }
            });
          });
        }
      },
      generator: generator ?? {
        async generate(value: Parameters<ContentGenerator["generate"]>[0]) {
          if (!env.AI) throw Error("COPY_AI_NOT_CONFIGURED");
          return createEMP003CopyGenerator(env.AI).generate(value);
        }
      },
      async loadCampaign(t: string, c: string) {
        const campaign = await repo.get(t, c);
        return campaign
          ? {
              campaign,
              revision:
                (await storage.get<number>(
                  `emp003:draft-revision:${t}:${c}`
                )) ?? 1
            }
          : undefined;
      },
      async canGenerate(t: string, c: string) {
        const raw = await storage.get<unknown>(reviewKey(t, c));
        return !raw || EMP003ReviewStateSchema.parse(raw).state === "DRAFT";
      }
    };
    const service = createEMP003CopyService(dependencies);
    const lifecycle = createEMP003CopyLifecycle(dependencies);
    if (brand) {
      const revision = url.searchParams.get("revision");
      if (
        revision !== null &&
        (!/^[1-9]\d*$/.test(revision) ||
          !Number.isSafeInteger(Number(revision)))
      )
        throw Error("COPY_INPUT_INVALID");
      return reply(200, {
        ok: true,
        ...(await lifecycle.brand(
          tenantId,
          revision === null ? undefined : Number(revision)
        ))
      });
    }
    if (edit || approve) {
      if (!request.headers.get("x-emp003-copy-actor"))
        return reply(403, { ok: false, error: "COPY_ACTOR_REQUIRED" });
      if (edit)
        return reply(200, {
          ok: true,
          ...(await lifecycle.edit(tenantId, input))
        });
      return reply(200, {
        ok: true,
        approval: await lifecycle.approve(tenantId, input)
      });
    }
    if (generate && input) {
      if (!request.headers.get("x-emp003-copy-actor"))
        return reply(403, {
          ok: false,
          error: "COPY_ACTOR_REQUIRED",
          retrySafe: true
        });
      if (!env.AI)
        return reply(503, {
          ok: false,
          error: "COPY_AI_NOT_CONFIGURED",
          retrySafe: true
        });
      await lifecycle.pinProfile(tenantId);
      const result = await service.generate(
        tenantId,
        CopyGenerateInput.parse(input)
      );
      return reply(
        result.state === "STARTED"
          ? 202
          : result.state === "FAILED"
            ? 503
            : 200,
        { ok: result.state === "SUCCEEDED", ...result }
      );
    }
    if (request.method !== "GET")
      return reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    if (url.pathname === "/copy-assets/approval") {
      const revision = Number(url.searchParams.get("revision"));
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw Error("COPY_INPUT_INVALID");
      return reply(200, {
        ok: true,
        ...(await lifecycle.approval(
          tenantId,
          campaignId,
          CopyId.parse(url.searchParams.get("assetId")),
          revision
        ))
      });
    }
    if (url.pathname === "/copy-assets/context")
      return reply(200, {
        ok: true,
        ...(await service.context(tenantId, campaignId))
      });
    if (url.pathname === "/copy-assets/status") {
      const result = await service.status(
        tenantId,
        campaignId,
        CopyId.parse(url.searchParams.get("operationId"))
      );
      return reply(
        result ? 200 : 404,
        result
          ? { ok: true, ...result }
          : { ok: false, error: "COPY_OPERATION_NOT_FOUND" }
      );
    }
    if (url.pathname === "/copy-assets")
      return reply(200, {
        ok: true,
        assets: await service.list(tenantId, campaignId)
      });
    if (url.pathname === "/copy-assets/content") {
      const revision = url.searchParams.get("revision");
      const value = await service.read(
        tenantId,
        campaignId,
        CopyId.parse(url.searchParams.get("assetId")),
        revision === null ? undefined : Number(revision)
      );
      if (!value)
        return reply(404, { ok: false, error: "COPY_ASSET_NOT_FOUND" });
      return new Response(Uint8Array.from(value.content), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-emp003-tenant": tenantId,
          "x-content-sha256": value.record.sha256,
          "x-asset-revision": String(value.record.revision),
          "cache-control": "no-store",
          "x-content-type-options": "nosniff"
        }
      });
    }
    return reply(404, { ok: false, error: "NOT_FOUND" });
  } catch (e) {
    const code =
      e instanceof Error && /^(COPY_|ASSET_)[A-Z_]+$/.test(e.message)
        ? e.message
        : "COPY_INPUT_OR_CONTEXT_INVALID";
    const status = code.includes("NOT_FOUND")
      ? 404
      : code.includes("QUOTA")
        ? 429
        : code.includes("CONFLICT") ||
            code.includes("IMMUTABLE") ||
            code.includes("IN_FLIGHT")
          ? 409
          : code.includes("CONTEXT") ||
              code.includes("KNOWLEDGE") ||
              code.includes("READBACK")
            ? 503
            : 400;
    return reply(status, {
      ok: false,
      error: code,
      retrySafe: [
        "COPY_QUOTA_EXHAUSTED",
        "COPY_CONTEXT_NOT_CONFIGURED",
        "COPY_CAMPAIGN_CONTEXT_REQUIRED",
        "COPY_CAMPAIGN_CONTEXT_MISMATCH",
        "COPY_VERIFIED_KNOWLEDGE_REQUIRED"
      ].includes(code)
    });
  }
}
