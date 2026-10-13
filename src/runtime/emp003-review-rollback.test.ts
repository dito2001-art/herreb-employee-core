import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEMP003ReviewTransaction } from "./emp003-review-transaction";

const request = { tenantId: "tenant-a", campaignId: "campaign-a", correlationId: "corr-rollback",
  actorId: "owner-a", actorRole: "owner", from: "DRAFT", to: "IN_REVIEW",
  reason: "Review", idempotencyKey: "idem-rollback" } as const;

/** Transactional test double: mutations become visible only after callback resolves. */
function transactionalFixture(failAtPut: number | null) {
  const committed = new Map<string, unknown>();
  return {
    committed,
    async transaction<T>(callback: (storage: {
      get<V = unknown>(key: string): Promise<V | undefined>;
      put<V>(key: string, value: V): Promise<void>;
      list<V = unknown>(options: { prefix: string }): Promise<Map<string, V>>;
    }) => Promise<T>): Promise<T> {
      const pending = new Map(committed);
      let puts = 0;
      const storage = {
        async get<V = unknown>(key: string): Promise<V | undefined> { return pending.get(key) as V | undefined; },
        async put<V>(key: string, value: V) {
          puts += 1;
          if (failAtPut === puts) throw new Error("SIMULATED_STORAGE_FAILURE");
          pending.set(key, value);
        },
        async list<V = unknown>({ prefix }: { prefix: string }): Promise<Map<string, V>> {
          return new Map([...pending].filter(([key]) => key.startsWith(prefix))) as Map<string, V>;
        }
      };
      const result = await callback(storage);
      committed.clear();
      for (const [key, value] of pending) committed.set(key, value);
      return result;
    }
  };
}

for (const failAtPut of [1, 2]) {
  test(`atomic review transaction rolls back when write ${failAtPut} fails`, async () => {
    const fixture = transactionalFixture(failAtPut);
    await assert.rejects(
      fixture.transaction((storage) => applyEMP003ReviewTransaction(storage, request, "tenant-a", "campaign-a", "2026-10-13T17:00:00Z")),
      /SIMULATED_STORAGE_FAILURE/
    );
    assert.equal(fixture.committed.size, 0);
  });
}

test("successful transaction commits review state and audit together", async () => {
  const fixture = transactionalFixture(null);
  const result = await fixture.transaction((storage) =>
    applyEMP003ReviewTransaction(storage, request, "tenant-a", "campaign-a", "2026-10-13T17:00:00Z")
  );
  assert.equal(result.state.state, "IN_REVIEW");
  assert.equal(fixture.committed.size, 2);
});
