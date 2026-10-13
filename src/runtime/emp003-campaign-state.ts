import { DurableObject } from "cloudflare:workers";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";

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
      return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    } catch {
      return Response.json({ ok: false, error: "EMP003_CAMPAIGN_STORAGE_REJECTED" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
  }
}
