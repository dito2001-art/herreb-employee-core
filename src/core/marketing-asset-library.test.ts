import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createMarketingAssetLibrary,
  groundedCopyAsset
} from "./marketing-asset-library";
import type { CampaignStorage } from "./campaign-persistent";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE records (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const objects = new Map<string, Uint8Array>();
  let queue = Promise.resolve();
  const storage: CampaignStorage = {
    async get(key) {
      return (
        db.prepare("SELECT value FROM records WHERE key=?").get(key) as
          | { value: string }
          | undefined
      )?.value;
    },
    async put(key, value) {
      db.prepare(
        "INSERT INTO records VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).run(key, value);
    },
    async list(prefix) {
      return db
        .prepare("SELECT key,value FROM records WHERE substr(key,1,?)=?")
        .all(prefix.length, prefix) as { key: string; value: string }[];
    }
  };
  const lib = createMarketingAssetLibrary(
    {
      async transaction(work) {
        const before = queue;
        let release!: () => void;
        queue = new Promise((resolve) => {
          release = resolve;
        });
        await before;
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await work(storage);
          db.exec("COMMIT");
          return result;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        } finally {
          release();
        }
      }
    },
    {
      async put(key, bytes) {
        objects.set(key, bytes);
      },
      async get(key) {
        return objects.get(key);
      }
    }
  );
  return { lib, db, objects };
}
const input = () =>
  groundedCopyAsset(
    {
      tenantId: "tenant-a",
      offeringId: "offering",
      audienceId: "audience",
      channel: "email",
      headline: "Probá el piloto",
      body: "Consultanos por la propuesta.",
      claimIds: ["verified"],
      sourceKnowledgeIds: ["evidence"],
      status: "DRAFT"
    },
    "campaign",
    "copy",
    "2026-10-28T18:00:00Z",
    "op-1"
  );
test("real copy bytes survive read-back and immutable version history", async () => {
  const { lib, db } = fixture();
  try {
    const first = await lib.register(input());
    assert.equal(first.revision, 1);
    assert.equal(first.status, "DRAFT");
    assert.equal(first.publishExecuted, false);
    const read = await lib.read("tenant-a", "campaign", "copy");
    assert.equal(
      new TextDecoder().decode(read!.content),
      "Probá el piloto\n\nConsultanos por la propuesta."
    );
    await lib.register({
      ...input(),
      expectedRevision: 1,
      operationId: "op-2",
      content: new TextEncoder().encode("Otra versión")
    });
    assert.equal(
      (await lib.read("tenant-a", "campaign", "copy"))!.record.revision,
      2
    );
    assert.equal((await lib.list("tenant-a", "campaign"))[0].revision, 2);
    assert.deepEqual(await lib.list("tenant-b", "campaign"), []);
    assert.deepEqual(
      (await lib.read("tenant-a", "campaign", "copy", 1))!.record,
      first
    );
  } finally {
    db.close();
  }
});
test("CAS accepts one concurrent writer and idempotency rejects changed input", async () => {
  const { lib, db } = fixture();
  try {
    const first = await lib.register(input());
    assert.deepEqual(await lib.register(input()), first);
    await assert.rejects(
      lib.register({
        ...input(),
        content: new TextEncoder().encode("conflict")
      }),
      /ASSET_IDEMPOTENCY_CONFLICT/
    );
    const results = await Promise.allSettled([
      lib.register({ ...input(), expectedRevision: 1, operationId: "a" }),
      lib.register({ ...input(), expectedRevision: 1, operationId: "b" })
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      (await lib.read("tenant-a", "campaign", "copy"))!.record.revision,
      2
    );
  } finally {
    db.close();
  }
});
test("tenant/campaign boundaries, corrupt objects and invalid evidence fail closed", async () => {
  const { lib, db, objects } = fixture();
  try {
    const r = await lib.register(input());
    assert.equal(await lib.read("tenant-b", "campaign", "copy"), undefined);
    assert.equal(await lib.read("tenant-a", "other", "copy"), undefined);
    await assert.rejects(lib.read("../tenant-a", "campaign", "copy"));
    await assert.rejects(lib.register({ ...input(), evidenceRefs: [] }));
    await assert.rejects(
      lib.register({ ...input(), mimeType: "application/javascript" }),
      /ASSET_MEDIA_TYPE_INVALID/
    );
    objects.set(r.objectKey, new Uint8Array([1]));
    await assert.rejects(
      lib.read("tenant-a", "campaign", "copy"),
      /ASSET_OBJECT_READBACK_FAILED/
    );
  } finally {
    db.close();
  }
});
