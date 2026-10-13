import { CampaignTransitionSchema } from "../core/marketing-campaign-lifecycle";
import { createEMP003AuditRepository } from "./emp003-campaign-audit";
import { advanceEMP003ReviewState, EMP003ReviewStateSchema, initialEMP003ReviewState } from "./emp003-review-state";

export interface EMP003ReviewTransactionStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T = unknown>(options: { prefix: string }): Promise<Map<string, T>>;
}
const safe = (value: string) => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("EMP003_REVIEW_ID_INVALID");
  return value;
};
export const reviewKey = (tenantId: string, campaignId: string) => `emp003:review:${safe(tenantId)}:${safe(campaignId)}`;

/** Invoke exclusively inside a Durable Object storage transaction. */
export async function applyEMP003ReviewTransaction(storage: EMP003ReviewTransactionStorage, raw: unknown, tenantId: string, campaignId: string, occurredAt: string) {
  const transition = CampaignTransitionSchema.parse(raw);
  if (transition.tenantId !== tenantId || transition.campaignId !== campaignId) throw new Error("EMP003_TRANSITION_SCOPE_REJECTED");
  const key = reviewKey(tenantId, campaignId);
  const audit = createEMP003AuditRepository(storage);
  const prior = await audit.list(tenantId, campaignId);
  const replay = prior.find((event) => event.idempotencyKey === transition.idempotencyKey);
  if (replay) {
    const { occurredAt: _time, eventType: _type, publishExecuted: _published, ...original } = replay;
    if (JSON.stringify(original) !== JSON.stringify(transition)) throw new Error("EMP003_TRANSITION_IDEMPOTENCY_CONFLICT");
    const state = EMP003ReviewStateSchema.parse(await storage.get<unknown>(key));
    return { state, audit: replay, replayed: true };
  }
  const previous = (await storage.get<unknown>(key)) ?? initialEMP003ReviewState(tenantId, campaignId);
  const next = advanceEMP003ReviewState(previous, transition);
  const event = await audit.append(transition, tenantId, occurredAt);
  await storage.put(key, next);
  return { state: next, audit: event, replayed: false };
}
