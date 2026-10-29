import test from "node:test";
import assert from "node:assert/strict";
import {
  copyAuth,
  copyFixture,
  copyBlueprint,
  copyContext
} from "./emp003-copy-fixture.test-support";
import {
  createEMP003AssetMetadataStorage,
  createEMP003AssetObjectStorage
} from "./emp003-asset-storage";
import { createMarketingAssetLibrary } from "../core/marketing-asset-library";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { handleEMP003CopyDO } from "./emp003-copy-do";
import { handleEMP003CopyAssets } from "./emp003-copy-routes";
import type { MarketingAssetVersion } from "../core/marketing-asset-library";
import type { z } from "zod";
import { CopyApprovalSchema } from "./emp003-copy-lifecycle";
type EditResponse = {
  record: MarketingAssetVersion;
  readBackConfirmed: boolean;
};
type ApprovalResponse = { approval: z.infer<typeof CopyApprovalSchema> };
type ApprovalRead = {
  approval: z.infer<typeof CopyApprovalSchema> | null;
  active: boolean;
};
import { reviewKey } from "./emp003-review-transaction";
async function setup() {
  const f = copyFixture(),
    auth = await copyAuth();
  const storage = f.storage as unknown as DurableObjectStorage;
  await createPersistentBlueprintRepository(
    createEMP003DurableStorageAdapter(storage)
  ).put("tenant-a", "campaign", copyBlueprint);
  await f.storage.put("emp003:draft-revision:tenant-a:campaign", 1);
  const library = createMarketingAssetLibrary(
    createEMP003AssetMetadataStorage(storage),
    createEMP003AssetObjectStorage(f.bucket)
  );
  const first = await library.register({
    tenantId: "tenant-a",
    campaignId: "campaign",
    assetId: "copy",
    kind: "COPY",
    channel: "Email",
    mimeType: "text/plain",
    content: new TextEncoder().encode("Original copy"),
    evidenceRefs: ["knowledge:knowledge"],
    createdAt: "2026-10-28T00:00:00Z",
    expectedRevision: 0,
    operationId: "seed"
  });
  let context = JSON.stringify([copyContext]);
  let bucket = f.bucket;
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "copy.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "copy",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      {
        email: "a@test.invalid",
        actorId: "a",
        tenantId: "tenant-a",
        role: "owner"
      },
      {
        email: "b@test.invalid",
        actorId: "b",
        tenantId: "tenant-b",
        role: "user"
      }
    ]),
    EMP003_CAMPAIGN_STATE: {
      idFromName: (t: string) => t,
      get: () => ({
        fetch: (r: Request) =>
          handleEMP003CopyDO(r, storage, {
            EMP003_ASSET_BUCKET: bucket,
            EMP003_COPY_CONTEXTS_JSON: context
          })
      })
    }
  };
  async function request(path: string, body?: unknown, b = false) {
    return handleEMP003CopyAssets(
      new Request("https://pilot.test/api/emp003/assets" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "cf-access-jwt-assertion": b ? auth.b : auth.a,
          "content-type": "application/json",
          origin: "https://pilot.test"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
      env,
      auth.fetcher
    );
  }
  const profile = (await (await request("/brand-brain")).json()) as {
    revision: number;
    hash: string;
  };
  const edit = {
    campaignId: "campaign",
    assetId: "copy",
    operationId: "edit-1",
    expectedRevision: 1,
    baseSha256: first.sha256,
    campaignRevision: 1,
    contextRevision: profile.revision,
    contextHash: profile.hash,
    text: "Copy editado manualmente"
  };
  return {
    ...f,
    library,
    request,
    first,
    edit,
    profile,
    setContext: (c: unknown) => (context = JSON.stringify(c)),
    setBucket: (b: R2Bucket) => (bucket = b),
    storage
  };
}
test(
  "authenticated manual edit preserves old bytes, idempotent concurrent retries, exact approval and no inherited approval",
  { timeout: 10000 },
  async () => {
    const f = await setup();
    try {
      const [a, b] = await Promise.all([
        f.request("/edit", f.edit),
        f.request("/edit", f.edit)
      ]);
      assert.equal(a.status, 200, await a.clone().text());
      assert.equal(b.status, 200, await b.clone().text());
      const x = (await a.json()) as EditResponse,
        y = (await b.json()) as EditResponse;
      assert.deepEqual(x.record, y.record);
      assert.equal(x.record.revision, 2);
      assert.equal(x.readBackConfirmed, true);
      const old = await f.request(
        "/content?campaignId=campaign&assetId=copy&revision=1"
      );
      assert.equal(old.status, 200);
      assert.equal(await old.text(), "Original copy");
      const fresh = await f.request(
        "/content?campaignId=campaign&assetId=copy&revision=2"
      );
      assert.equal(fresh.status, 200);
      assert.equal(fresh.headers.get("x-content-sha256"), x.record.sha256);
      assert.equal(await fresh.text(), f.edit.text);
      assert.equal(
        (await f.request("/edit", { ...f.edit, text: "different" })).status,
        409
      );
      assert.equal(
        (await f.request("/edit", { ...f.edit, operationId: "stale" })).status,
        409
      );
      const approval = {
        campaignId: "campaign",
        assetId: "copy",
        operationId: "approve-2",
        revision: 2,
        sha256: x.record.sha256,
        campaignRevision: 1,
        contextRevision: f.profile.revision,
        contextHash: f.profile.hash,
        claimsReviewed: true
      };
      assert.equal(
        (await f.request("/approve", { ...approval, sha256: "0".repeat(64) }))
          .status,
        409
      );
      const approved = await f.request("/approve", approval);
      assert.equal(approved.status, 200);
      const accepted = (await approved.json()) as ApprovalResponse;
      assert.equal(accepted.approval.revision, 2);
      assert.equal(accepted.approval.sha256, x.record.sha256);
      assert.deepEqual(accepted.approval.claimIds, ["claim"]);
      const again = await (await f.request("/approve", approval)).json();
      assert.deepEqual(again, accepted);
      assert.equal(
        (
          (await (
            await f.request(
              "/approval?campaignId=campaign&assetId=copy&revision=2"
            )
          ).json()) as ApprovalRead
        ).active,
        true
      );
      const next = await f.request("/edit", {
        ...f.edit,
        operationId: "edit-2",
        expectedRevision: 2,
        baseSha256: x.record.sha256,
        text: "Tercera versión"
      });
      assert.equal(next.status, 200);
      const current = (await (
        await f.request("/approval?campaignId=campaign&assetId=copy&revision=3")
      ).json()) as ApprovalRead;
      assert.equal(current.active, false);
      assert.equal(current.approval, null);
      const historical = (await (
        await f.request("/approval?campaignId=campaign&assetId=copy&revision=2")
      ).json()) as ApprovalRead;
      assert.equal(historical.active, false);
      assert.equal(historical.approval!.sha256, x.record.sha256);
    } finally {
      f.db.close();
    }
  }
);
test(
  "B cannot read or write A, client claims rejected, approved campaign rejects edits atomically",
  { timeout: 10000 },
  async () => {
    const f = await setup();
    try {
      for (const route of [
        "?campaignId=campaign",
        "/content?campaignId=campaign&assetId=copy&revision=1",
        "/approval?campaignId=campaign&assetId=copy&revision=1",
        "/status?campaignId=campaign&operationId=anything"
      ]) {
        const r = await f.request(route, undefined, true);
        assert.equal(r.status, 404, route);
        assert.doesNotMatch(await r.text(), /Original copy|tenant-a|knowledge/);
      }
      for (const route of ["/edit", "/approve"]) {
        assert.equal((await f.request(route, f.edit, true)).status, 403);
      }
      assert.equal(
        (await f.request("/brand-brain", undefined, true)).status,
        503
      );
      assert.equal(
        (
          await f.request("/edit", {
            ...f.edit,
            claims: [{ verified: true, text: "Invented" }]
          })
        ).status,
        400
      );
      assert.equal(
        (await f.request("/edit", { ...f.edit, tenantId: "tenant-b" })).status,
        400
      );
      await f.storage.put(reviewKey("tenant-a", "campaign"), {
        tenantId: "tenant-a",
        campaignId: "campaign",
        state: "APPROVED",
        revision: 1,
        lastCorrelationId: null,
        publishExecuted: false
      });
      assert.equal((await f.request("/edit", f.edit)).status, 409);
      assert.equal(
        (await f.library.read("tenant-a", "campaign", "copy"))!.record.revision,
        1
      );
      assert.equal((await f.library.list("tenant-a", "campaign")).length, 1);
    } finally {
      f.db.close();
    }
  }
);
test(
  "Brand Brain immutable snapshots reject same-version replacement and approval invalidates on profile revision",
  { timeout: 10000 },
  async () => {
    const f = await setup();
    try {
      assert.equal((await f.request("/edit", f.edit)).status, 200);
      f.setContext([
        {
          ...copyContext,
          brand: { ...copyContext.brand, name: "Changed without version" }
        }
      ]);
      assert.equal((await f.request("/brand-brain")).status, 409);
      f.setContext([{ ...copyContext, revision: 2 }]);
      const p = (await (await f.request("/brand-brain")).json()) as {
        revision: number;
        hash: string;
      };
      assert.equal(p.revision, 2);
      assert.equal(
        (await f.request("/edit", { ...f.edit, operationId: "old-context" }))
          .status,
        409
      );
      const before = await f.library.read("tenant-a", "campaign", "copy");
      const edited = await f.request("/edit", {
        ...f.edit,
        operationId: "v2",
        expectedRevision: 2,
        baseSha256: before!.record.sha256,
        contextRevision: 2,
        contextHash: p.hash
      });
      assert.equal(edited.status, 200);
      const history = (await (
        await f.request("/brand-brain?revision=1")
      ).json()) as { revision: number; hash: string };
      assert.equal(history.revision, 1);
      assert.equal(history.hash, f.profile.hash);
      f.setContext([copyContext]);
      assert.equal((await f.request("/brand-brain")).status, 409);
    } finally {
      f.db.close();
    }
  }
);
test(
  "review change during R2 write fences metadata, ambiguous manual retry uses same operation without AI",
  { timeout: 10000 },
  async () => {
    const f = await setup();
    try {
      const bucket = f.bucket;
      let fail = true;
      f.setBucket({
        ...bucket,
        async get(key: string) {
          if (fail) {
            fail = false;
            return null;
          }
          return bucket.get(key);
        }
      } as unknown as R2Bucket);
      // Source read-back fails before reserving; no accepted version is changed.
      assert.equal((await f.request("/edit", f.edit)).status, 503);
      f.setBucket({
        ...bucket,
        async put(key: string, bytes: Uint8Array) {
          await bucket.put(key, bytes);
          await f.storage.put(reviewKey("tenant-a", "campaign"), {
            tenantId: "tenant-a",
            campaignId: "campaign",
            state: "IN_REVIEW",
            revision: 1,
            lastCorrelationId: null,
            publishExecuted: false
          });
        }
      } as unknown as R2Bucket);
      assert.equal((await f.request("/edit", f.edit)).status, 409);
      assert.equal(
        (await f.library.read("tenant-a", "campaign", "copy"))!.record.revision,
        1
      );
      await f.storage.put(reviewKey("tenant-a", "campaign"), {
        tenantId: "tenant-a",
        campaignId: "campaign",
        state: "DRAFT",
        revision: 2,
        lastCorrelationId: null,
        publishExecuted: false
      });
      f.setBucket(bucket);
      assert.equal((await f.request("/edit", f.edit)).status, 409);
      assert.equal(
        (await f.request("/edit", { ...f.edit, operationId: "after-reopen" }))
          .status,
        200
      );
    } finally {
      f.db.close();
    }
  }
);

test(
  "accepted manual write recovers lost read-back with original bytes and no duplicate after context changes",
  { timeout: 10000 },
  async () => {
    const f = await setup();
    try {
      const bucket = f.bucket;
      let gets = 0;
      f.setBucket({
        ...bucket,
        async get(key: string) {
          gets++;
          if (gets === 3) return null;
          return bucket.get(key);
        }
      } as unknown as R2Bucket);
      assert.equal((await f.request("/edit", f.edit)).status, 503);
      assert.equal(
        (await f.library.read("tenant-a", "campaign", "copy"))!.record.revision,
        2
      );
      f.setBucket(bucket);
      f.setContext([{ ...copyContext, revision: 2 }]);
      const recovered = await f.request("/edit", f.edit);
      assert.equal(recovered.status, 200);
      const record = ((await recovered.json()) as EditResponse).record;
      assert.equal(record.revision, 2);
      const replay = await f.request("/edit", f.edit);
      assert.equal(replay.status, 200);
      assert.deepEqual(((await replay.json()) as EditResponse).record, record);
      assert.equal(
        (await f.library.read("tenant-a", "campaign", "copy"))!.record.revision,
        2
      );
    } finally {
      f.db.close();
    }
  }
);
