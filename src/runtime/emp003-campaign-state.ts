import { DurableObject } from "cloudflare:workers";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003AuditRepository } from "./emp003-campaign-audit";
import { advanceEMP003ReviewState, initialEMP003ReviewState, EMP003ReviewStateSchema } from "./emp003-review-state";
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
        return Response.json({ ok: true, found: Boolean(campaign), campaign: campaign ?? null }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/drafts") {
        const campaigns = await repo.list(tenantId);
        return Response.json({ ok: true, campaigns }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "POST" && url.pathname === "/draft") {
        const payload: unknown = await request.json();
        await repo.put(tenantId, campaignId, payload as never);
        const campaign = await repo.get(tenantId, campaignId);
        return Response.json({ ok: true, persisted: true, campaign }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/review") {
        const state = await this.ctx.storage.get<unknown>(`emp003:review:${tenantId}:${campaignId}`);
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
        const key = `emp003:review:${tenantId}:${campaignId}`;
        const result = await this.ctx.storage.transaction(async (txn) => {
          const audit = createEMP003AuditRepository(txn);
          const prior = await audit.list(tenantId, campaignId);
          const replay = prior.find((event) => event.idempotencyKey === transition.idempotencyKey);
          if (replay) {
            if (JSON.stringify({ ...replay, occurredAt: undefined, eventType: undefined, publishExecuted: undefined }) !== JSON.stringify(transition)) throw new Error("EMP003_TRANSITION_IDEMPOTENCY_CONFLICT");
            const stored = await txn.get<unknown>(key);
            return { state: EMP003ReviewStateSchema.parse(stored), audit: replay, replayed: true };
          }
          const previous = (await txn.get<unknown>(key)) ?? initialEMP003ReviewState(tenantId, campaignId);
          const next = advanceEMP003ReviewState(previous, transition);
          const event = await audit.append(transition, tenantId, new Date().toISOString());
          await txn.put(key, next);
          return { state: next, audit: event, replayed: false };
        });
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
