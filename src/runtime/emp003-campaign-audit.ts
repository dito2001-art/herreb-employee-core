import { z } from "zod";
import { createCampaignAuditRecord, CampaignTransitionSchema } from "../core/marketing-campaign-lifecycle";

/** Append-only EMP-003 audit events, isolated by tenant and campaign. */
export const EMP003AuditEventSchema = CampaignTransitionSchema.extend({
  eventType: z.literal("EMP003_CAMPAIGN_STATE_TRANSITION"),
  occurredAt: z.string().datetime({ offset: true }),
  publishExecuted: z.literal(false)
});
export type EMP003AuditEvent = z.infer<typeof EMP003AuditEventSchema>;

export interface EMP003AuditStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T = unknown>(options: { prefix: string }): Promise<Map<string, T>>;
}
const safe = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("EMP003_AUDIT_ID_INVALID");
  return id;
};
const base = (tenantId: string, campaignId: string) =>
  `emp003:audit:${safe(tenantId)}:${safe(campaignId)}:`;
const eventKey = (tenantId: string, campaignId: string, idempotencyKey: string) =>
  base(tenantId, campaignId) + safe(idempotencyKey);

export function createEMP003AuditRepository(storage: EMP003AuditStorage) {
  return {
    async append(raw: unknown, tenantId: string, occurredAt: string): Promise<EMP003AuditEvent> {
      const transition = CampaignTransitionSchema.parse(raw);
      const event = EMP003AuditEventSchema.parse(createCampaignAuditRecord(transition, tenantId, occurredAt));
      const key = eventKey(tenantId, event.campaignId, event.idempotencyKey);
      const existing = await storage.get<unknown>(key);
      if (existing !== undefined) {
        const previous = EMP003AuditEventSchema.parse(existing);
        if (JSON.stringify(previous) !== JSON.stringify(event))
          throw new Error("EMP003_AUDIT_IDEMPOTENCY_CONFLICT");
        return previous;
      }
      await storage.put(key, event);
      const saved = EMP003AuditEventSchema.parse(await storage.get<unknown>(key));
      if (JSON.stringify(saved) !== JSON.stringify(event)) throw new Error("EMP003_AUDIT_READBACK_FAILED");
      return saved;
    },
    async list(tenantId: string, campaignId: string): Promise<EMP003AuditEvent[]> {
      const prefix = base(tenantId, campaignId);
      const records = await storage.list<unknown>({ prefix });
      const events: EMP003AuditEvent[] = [];
      for (const [key, value] of records) {
        if (!key.startsWith(prefix)) throw new Error("EMP003_AUDIT_SCOPE_REJECTED");
        const event = EMP003AuditEventSchema.parse(value);
        if (event.tenantId !== tenantId || event.campaignId !== campaignId ||
            key !== eventKey(tenantId, campaignId, event.idempotencyKey))
          throw new Error("EMP003_AUDIT_SCOPE_REJECTED");
        events.push(event);
      }
      return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    }
  };
}
