import {
  BlueprintPinSchema,
  hashEMP003Blueprint
} from "../core/emp003-blueprint-pin";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { CampaignTransitionSchema } from "../core/marketing-campaign-lifecycle";
import { createEMP003AuditRepository } from "./emp003-campaign-audit";
import {
  advanceEMP003ReviewState,
  EMP003ReviewStateSchema,
  initialEMP003ReviewState
} from "./emp003-review-state";

export interface EMP003ReviewTransactionStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T = unknown>(options: { prefix: string }): Promise<Map<string, T>>;
}
const safe = (value: string) => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Error("EMP003_REVIEW_ID_INVALID");
  return value;
};
export const reviewKey = (tenantId: string, campaignId: string) =>
  `emp003:review:${safe(tenantId)}:${safe(campaignId)}`;

/** Invoke exclusively inside a Durable Object storage transaction. */
export async function applyEMP003ReviewTransaction(
  storage: EMP003ReviewTransactionStorage,
  raw: unknown,
  tenantId: string,
  campaignId: string,
  occurredAt: string,
  expectedBlueprint?: { revision: number; sha256: string }
) {
  const transition = CampaignTransitionSchema.parse(raw);
  if (transition.tenantId !== tenantId || transition.campaignId !== campaignId)
    throw new Error("EMP003_TRANSITION_SCOPE_REJECTED");
  const key = reviewKey(tenantId, campaignId);
  const pinKey = `emp003:review-content:${safe(tenantId)}:${safe(campaignId)}:${safe(transition.idempotencyKey)}`;
  const expectedPin = expectedBlueprint
    ? BlueprintPinSchema.parse({
        tenantId,
        campaignId,
        ...expectedBlueprint,
        idempotencyKey: transition.idempotencyKey,
        correlationId: transition.correlationId
      })
    : undefined;

  const audit = createEMP003AuditRepository(storage);
  const prior = await audit.list(tenantId, campaignId);
  const replay = prior.find(
    (event) => event.idempotencyKey === transition.idempotencyKey
  );
  if (replay) {
    const pinRaw = await storage.get<unknown>(pinKey);
    if (
      expectedPin &&
      (!pinRaw ||
        JSON.stringify(BlueprintPinSchema.parse(pinRaw)) !==
          JSON.stringify(expectedPin))
    )
      throw Error("EMP003_REVIEW_PIN_IDEMPOTENCY_CONFLICT");
    const {
      occurredAt: _time,
      eventType: _type,
      publishExecuted: _published,
      ...original
    } = replay;
    if (JSON.stringify(original) !== JSON.stringify(transition))
      throw new Error("EMP003_TRANSITION_IDEMPOTENCY_CONFLICT");
    const state = EMP003ReviewStateSchema.parse(
      await storage.get<unknown>(key)
    );
    // A replay is acknowledged only when its transition is still the latest state change.
    // Never report a newer campaign state as the result of an older idempotency key.
    if (
      state.state !== replay.to ||
      state.lastCorrelationId !== replay.correlationId
    ) {
      throw new Error("EMP003_TRANSITION_REPLAY_SUPERSEDED");
    }
    return { state, audit: replay, replayed: true, blueprintPin: expectedPin };
  }
  if (expectedPin) {
    const revision =
      (await storage.get<number>(
        `emp003:draft-revision:${tenantId}:${campaignId}`
      )) ?? 1;
    const blueprint = await createPersistentBlueprintRepository(
      createEMP003DurableStorageAdapter(storage)
    ).get(tenantId, campaignId);
    if (
      !blueprint ||
      revision !== expectedPin.revision ||
      (await hashEMP003Blueprint(blueprint)) !== expectedPin.sha256
    )
      throw Error("EMP003_REVIEW_CONTENT_REVISION_CONFLICT");
  }
  const previous =
    (await storage.get<unknown>(key)) ??
    initialEMP003ReviewState(tenantId, campaignId);
  const next = advanceEMP003ReviewState(previous, transition);
  const event = await audit.append(transition, tenantId, occurredAt);
  await storage.put(key, next);
  if (expectedPin) {
    await storage.put(pinKey, expectedPin);
    await storage.put(
      `emp003:review-content:${tenantId}:${campaignId}:latest`,
      expectedPin
    );
  }
  return {
    state: next,
    audit: event,
    replayed: false,
    blueprintPin: expectedPin
  };
}
