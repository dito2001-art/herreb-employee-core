import { DurableObject } from "cloudflare:workers";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003AuditRepository } from "./emp003-campaign-audit";
import { EMP003ReviewStateSchema } from "./emp003-review-state";
import { applyEMP003ReviewTransaction, reviewKey } from "./emp003-review-transaction";
import { CampaignTransitionSchema } from "../core/marketing-campaign-lifecycle";

/** EMP-003-only durable storage. Expose read/write only to the owning Worker, not public routes. */
export class EMP003CampaignState extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? "";
    const campaignId = url.searchParams.get("campaignId") ?? "";
    const repo = createPersistentBlueprintRepository(createEMP003DurableStorageAdapter(this.ctx.storage));
    try {
      if (request.method === "GET" && url.pathname === "/draft") {
        const campaign = await repo.get(tenantId, campaignId);
        const revision = await this.ctx.storage.get<number>(`emp003:draft-revision:${tenantId}:${campaignId}`);
        return Response.json({ ok: true, found: Boolean(campaign), campaign: campaign ?? null, revision: revision ?? (campaign ? 1 : 0) }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/drafts") {
        const campaigns = await repo.list(tenantId);
        return Response.json({ ok: true, campaigns }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/operations") {
        const campaigns = await repo.listWithIds(tenantId);
        const items = await Promise.all(campaigns.map(async ({ campaignId, blueprint }) => {
          const raw = await this.ctx.storage.get<unknown>(reviewKey(tenantId, campaignId));
          const review = raw === undefined ? null : EMP003ReviewStateSchema.parse(raw);
          if (review && (review.tenantId !== tenantId || review.campaignId !== campaignId)) throw new Error("EMP003_OPERATIONS_SCOPE_REJECTED");
          return {
            campaignId, blueprint,
            reviewState: review?.state ?? "DRAFT",
            reviewRevision: review?.revision ?? 0,
            requiresOwnerReview: review?.state === undefined || review.state === "DRAFT" || review.state === "IN_REVIEW",
            publishAuthorized: false as const,
            publishExecuted: false as const
          };
        }));
        return Response.json({ ok: true, tenantId, campaigns: items }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "POST" && url.pathname === "/draft") {
        const payload: unknown = await request.json();
        // Keep duplicate protection and review-state immutability in one atomic transaction.
        const createOnly = url.searchParams.get("createOnly") === "1";
        const hasExpectedRevision = url.searchParams.has("expectedRevision");
        if (createOnly === hasExpectedRevision || (url.searchParams.has("createOnly") && !createOnly))
          return Response.json({ ok: false, error: "EMP003_DRAFT_REVISION_REQUIRED" }, { status: 428, headers: { "cache-control": "no-store" } });
        const expectedRevisionRaw = url.searchParams.get("expectedRevision");
        const expectedRevision = expectedRevisionRaw === null ? null : Number(expectedRevisionRaw);
        if (url.searchParams.has("expectedRevision") && (expectedRevision === null || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1))
          return Response.json({ ok: false, error: "EMP003_DRAFT_REVISION_REQUIRED" }, { status: 428, headers: { "cache-control": "no-store" } });
        const result = await this.ctx.storage.transaction(async (txn) => {
          const transactionalRepo = createPersistentBlueprintRepository(createEMP003DurableStorageAdapter(txn));
          const current = await transactionalRepo.get(tenantId, campaignId);
          if (createOnly && current) return "EXISTS" as const;
          if (!createOnly && !current) return "MISSING" as const;
          const revisionKey = `emp003:draft-revision:${tenantId}:${campaignId}`;
          const currentRevision = (await txn.get<number>(revisionKey)) ?? (current ? 1 : 0);
          if (!createOnly && currentRevision !== expectedRevision) return "CONFLICT" as const;
          const state = await txn.get<unknown>(reviewKey(tenantId, campaignId));
          if (state !== undefined && EMP003ReviewStateSchema.parse(state).state !== "DRAFT") {
            throw new Error("EMP003_REVIEWED_DRAFT_IMMUTABLE");
          }
          await transactionalRepo.put(tenantId, campaignId, payload as never);
          await txn.put(revisionKey, currentRevision + 1);
          return "CREATED" as const;
        });
        if (result === "MISSING") return Response.json({ ok: false, error: "EMP003_DRAFT_NOT_FOUND" }, { status: 404 });
        if (result === "CONFLICT") return Response.json({ ok: false, error: "EMP003_DRAFT_REVISION_CONFLICT" }, { status: 409 });
        if (result === "EXISTS") {
          return Response.json({ ok: false, error: "EMP003_DRAFT_ALREADY_EXISTS" }, { status: 409, headers: { "cache-control": "no-store" } });
        }
        const campaign = await repo.get(tenantId, campaignId);
        const revision = await this.ctx.storage.get<number>(`emp003:draft-revision:${tenantId}:${campaignId}`);
        return Response.json({ ok: true, persisted: true, campaign, revision }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/review") {
        const state = await this.ctx.storage.get<unknown>(reviewKey(tenantId, campaignId));
        return Response.json({ ok: true, found: state !== undefined, state: state === undefined ? null : EMP003ReviewStateSchema.parse(state) }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/audit") {
        const events = await createEMP003AuditRepository(this.ctx.storage).list(tenantId, campaignId);
        return Response.json({ ok: true, events }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "POST" && url.pathname === "/transition") {
        const raw: unknown = await request.json();
        const transition = CampaignTransitionSchema.parse(raw);
        if (transition.tenantId !== tenantId || transition.campaignId !== campaignId) throw new Error("EMP003_TRANSITION_SCOPE_REJECTED");
        const blueprint = await repo.get(tenantId, campaignId);
        if (!blueprint) throw new Error("EMP003_TRANSITION_DRAFT_NOT_FOUND");
        const key = reviewKey(tenantId, campaignId);
        const result = await this.ctx.storage.transaction((txn) =>
          applyEMP003ReviewTransaction(txn, transition, tenantId, campaignId, new Date().toISOString())
        );
        const readBack = EMP003ReviewStateSchema.parse(await this.ctx.storage.get<unknown>(key));
        if (JSON.stringify(readBack) !== JSON.stringify(result.state)) throw new Error("EMP003_TRANSITION_READBACK_FAILED");
        return Response.json({ ok: true, persisted: true, ...result, readBackConfirmed: true }, { headers: { "cache-control": "no-store" } });
      }
      return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    } catch {
      return Response.json({ ok: false, error: "EMP003_CAMPAIGN_STORAGE_REJECTED" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
  }
}
