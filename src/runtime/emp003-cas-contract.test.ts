import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Contract model for the atomic transaction in EMP003CampaignState.
 * These tests DO NOT replace workerd concurrency and isolation certification.
 */
function createDraftStore() {
  const records = new Map<string, { revision: number; state: "DRAFT" | "APPROVED"; value: string }>();
  let queue: Promise<void> = Promise.resolve();
  async function transact(id: string, value: string, expectedRevision?: number) {
    const prior = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      const current = records.get(id);
      if (expectedRevision === undefined && current) return { status: 409, error: "EXISTS" };
      if (expectedRevision !== undefined && !current) return { status: 404, error: "MISSING" };
      if (current?.state === "APPROVED") return { status: 400, error: "IMMUTABLE" };
      if (expectedRevision !== undefined && current?.revision !== expectedRevision) return { status: 409, error: "CONFLICT" };
      const revision = (current?.revision ?? 0) + 1;
      records.set(id, { revision, state: "DRAFT", value });
      return { status: 200, revision };
    } finally { release(); }
  }
  return { records, transact };
}
test("CAS rejects stale revision without overwriting accepted update", async () => {
  const store = createDraftStore();
  assert.equal((await store.transact("a", "initial")).status, 200);
  assert.equal((await store.transact("a", "new", 1)).status, 200);
  assert.equal((await store.transact("a", "stale", 1)).status, 409);
  assert.deepEqual(store.records.get("a"), { revision: 2, state: "DRAFT", value: "new" });
});
test("CAS concurrent writers: exactly one succeeds for same revision", async () => {
  const store = createDraftStore();
  await store.transact("a", "initial");
  const results = await Promise.all([store.transact("a", "first", 1), store.transact("a", "second", 1)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(store.records.get("a")?.revision, 2);
});
test("approved draft cannot be changed even with current revision", async () => {
  const store = createDraftStore();
  await store.transact("a", "initial");
  store.records.get("a")!.state = "APPROVED";
  assert.equal((await store.transact("a", "modified", 1)).status, 400);
  assert.equal(store.records.get("a")?.value, "initial");
});
test("creation rejects duplicate and never overwrites", async () => {
  const store = createDraftStore();
  await store.transact("a", "initial");
  assert.equal((await store.transact("a", "duplicate")).status, 409);
  assert.equal(store.records.get("a")?.revision, 1);
});
