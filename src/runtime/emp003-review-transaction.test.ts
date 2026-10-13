import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEMP003ReviewTransaction, reviewKey } from "./emp003-review-transaction";

const transition = { tenantId: "tenant-a", campaignId: "campaign-a", correlationId: "corr-a",
  actorId: "owner-a", actorRole: "owner", from: "DRAFT", to: "IN_REVIEW",
  reason: "Review", idempotencyKey: "idem-a" } as const;
function storage() {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { data.set(key, value); },
    async list<T = unknown>({ prefix }: { prefix: string }): Promise<Map<string, T>> {
      return new Map([...data].filter(([key]) => key.startsWith(prefix))) as Map<string, T>;
    }
  };
}
test("transition persists review state and audit with readback", async () => {
  const store = storage();
  const result = await applyEMP003ReviewTransaction(store, transition, "tenant-a", "campaign-a", "2026-10-13T17:00:00Z");
  assert.equal(result.state.state, "IN_REVIEW");
  assert.equal(result.state.revision, 1);
  assert.equal(result.audit.publishExecuted, false);
  assert.deepEqual(await store.get(reviewKey("tenant-a", "campaign-a")), result.state);
});
test("idempotent replay does not advance revision or append audit", async () => {
  const store = storage();
  const first = await applyEMP003ReviewTransaction(store, transition, "tenant-a", "campaign-a", "2026-10-13T17:00:00Z");
  const second = await applyEMP003ReviewTransaction(store, transition, "tenant-a", "campaign-a", "2026-10-13T18:00:00Z");
  assert.equal(second.replayed, true);
  assert.deepEqual(second.state, first.state);
  assert.deepEqual(second.audit, first.audit);
  assert.equal((await store.list({ prefix: "emp003:audit:tenant-a:campaign-a:" })).size, 1);
});
test("conflicting replay and unauthorized scope are rejected", async () => {
  const store = storage();
  await applyEMP003ReviewTransaction(store, transition, "tenant-a", "campaign-a", "2026-10-13T17:00:00Z");
  await assert.rejects(applyEMP003ReviewTransaction(store, { ...transition, reason: "Changed" }, "tenant-a", "campaign-a", "2026-10-13T18:00:00Z"), /EMP003_TRANSITION_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(applyEMP003ReviewTransaction(store, transition, "tenant-b", "campaign-a", "2026-10-13T18:00:00Z"), /EMP003_TRANSITION_SCOPE_REJECTED/);
  assert.throws(() => reviewKey("tenant:a", "campaign-a"), /EMP003_REVIEW_ID_INVALID/);
});
