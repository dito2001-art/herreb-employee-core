import test from "node:test";
import assert from "node:assert/strict";
import { copyFixture, copyBlueprint } from "./emp003-copy-fixture.test-support";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { hashEMP003Blueprint } from "../core/emp003-blueprint-pin";
import {
  applyEMP003ReviewTransaction,
  reviewKey
} from "./emp003-review-transaction";
const transition = {
  tenantId: "tenant-a",
  campaignId: "campaign",
  actorId: "owner",
  actorRole: "owner",
  from: "DRAFT",
  to: "IN_REVIEW",
  correlationId: "pin-1",
  reason: "Reviewed exact content",
  idempotencyKey: "pin-1"
} as const;
test("transaction rejects content changed after BFF preflight, pins exact approval and binds replay", async () => {
  const f = copyFixture();
  try {
    const repo = createPersistentBlueprintRepository(
      createEMP003DurableStorageAdapter(f.storage)
    );
    await repo.put("tenant-a", "campaign", copyBlueprint);
    await f.storage.put("emp003:draft-revision:tenant-a:campaign", 1);
    const original = {
      revision: 1,
      sha256: await hashEMP003Blueprint(copyBlueprint)
    };
    const changed = { ...copyBlueprint, objective: "A changed objective" };
    await repo.put("tenant-a", "campaign", changed);
    await f.storage.put("emp003:draft-revision:tenant-a:campaign", 2);
    const run = (raw: unknown, pin: typeof original) =>
      f.storage.transaction((s) =>
        applyEMP003ReviewTransaction(
          s,
          raw,
          "tenant-a",
          "campaign",
          "2026-10-29T00:00:00Z",
          pin
        )
      );
    await assert.rejects(
      run(transition, original),
      /CONTENT_REVISION_CONFLICT/
    );
    assert.equal(
      await f.storage.get(reviewKey("tenant-a", "campaign")),
      undefined
    );
    assert.equal((await f.storage.list({ prefix: "emp003:audit:" })).size, 0);
    const exact = { revision: 2, sha256: await hashEMP003Blueprint(changed) };
    const first = await run(transition, exact);
    assert.equal(first.blueprintPin?.revision, 2);
    assert.equal(first.blueprintPin?.sha256, exact.sha256);
    const approved = await run(
      {
        ...transition,
        from: "IN_REVIEW",
        to: "APPROVED",
        idempotencyKey: "pin-2",
        correlationId: "pin-2"
      },
      exact
    );
    assert.equal(approved.state.state, "APPROVED");
    assert.deepEqual(
      await f.storage.get("emp003:review-content:tenant-a:campaign:latest"),
      approved.blueprintPin
    );
    const replay = await run(
      {
        ...transition,
        from: "IN_REVIEW",
        to: "APPROVED",
        idempotencyKey: "pin-2",
        correlationId: "pin-2"
      },
      exact
    );
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.blueprintPin, approved.blueprintPin);
    await assert.rejects(
      run(
        {
          ...transition,
          from: "IN_REVIEW",
          to: "APPROVED",
          idempotencyKey: "pin-2",
          correlationId: "pin-2"
        },
        original
      ),
      /PIN_IDEMPOTENCY_CONFLICT/
    );
    assert.equal((await f.storage.list({ prefix: "emp003:audit:" })).size, 2);
  } finally {
    f.db.close();
  }
});
test("blueprint digest is independent of object key order and changes with persisted content", async () => {
  const reversed = Object.fromEntries(Object.entries(copyBlueprint).reverse());
  assert.equal(
    await hashEMP003Blueprint(reversed),
    await hashEMP003Blueprint(copyBlueprint)
  );
  assert.notEqual(
    await hashEMP003Blueprint({
      ...copyBlueprint,
      keyMessages: ["Different content"]
    }),
    await hashEMP003Blueprint(copyBlueprint)
  );
});
