import test from "node:test";
import assert from "node:assert/strict";
import { createEMP003CopyService } from "./emp003-copy-service";
import {
  createEMP003AssetMetadataStorage,
  createEMP003AssetObjectStorage
} from "./emp003-asset-storage";
import { resolveCopyGeneration } from "./emp003-copy-context";
import {
  copyFixture,
  copyContext,
  copyBlueprint,
  copyRequest
} from "./emp003-copy-fixture.test-support";
function setup(limit = 3) {
  const fixture = copyFixture();
  let calls = 0;
  let fail = false;
  let writable = true;
  const service = createEMP003CopyService({
    metadata: createEMP003AssetMetadataStorage(
      fixture.storage as unknown as DurableObjectStorage
    ),
    objects: createEMP003AssetObjectStorage(fixture.bucket),
    contextJson: JSON.stringify([{ ...copyContext, dailyLimit: limit }]),
    generator: {
      async generate() {
        calls++;
        if (fail) throw Error("provider secret error");
        return {
          headline: "Probá el servicio",
          body: "Consultanos por la consultoría.",
          claimIds: ["claim"]
        };
      }
    },
    async loadCampaign(t, c) {
      return t === "tenant-a" && c === "campaign"
        ? { campaign: copyBlueprint, revision: 1 }
        : undefined;
    },
    async canGenerate() {
      return writable;
    },
    now: () => new Date("2026-10-28T20:00:00Z")
  });
  return {
    ...fixture,
    service,
    calls: () => calls,
    setFail: () => {
      fail = true;
    },
    review: () => {
      writable = false;
    }
  };
}
test("generation→registration→list→exact bytes, immutable revisions and operation replay", async () => {
  const f = setup();
  try {
    const first = await f.service.generate("tenant-a", copyRequest);
    assert.equal(first.state, "SUCCEEDED");
    assert.equal(first.record?.revision, 1);
    assert.equal((await f.service.list("tenant-a", "campaign")).length, 1);
    assert.equal(
      new TextDecoder().decode(
        (await f.service.read("tenant-a", "campaign", "copy", 1))!.content
      ),
      "Probá el servicio\n\nConsultanos por la consultoría."
    );
    assert.deepEqual(await f.service.generate("tenant-a", copyRequest), first);
    assert.equal(f.calls(), 1);
    await assert.rejects(
      () =>
        f.service.generate("tenant-a", { ...copyRequest, channel: "other" }),
      /IDEMPOTENCY_CONFLICT/
    );
    await assert.rejects(
      () =>
        f.service.generate("tenant-a", {
          ...copyRequest,
          operationId: "stale"
        }),
      /REVISION_CONFLICT/
    );
    assert.equal(f.calls(), 1);
    await f.service.generate("tenant-a", {
      ...copyRequest,
      operationId: "op-2",
      expectedRevision: 1
    });
    assert.equal(
      (await f.service.read("tenant-a", "campaign", "copy", 1))!.record
        .revision,
      1
    );
    assert.equal(
      (await f.service.read("tenant-a", "campaign", "copy"))!.record.revision,
      2
    );
    assert.equal(
      (await f.service.status("tenant-a", "campaign", "op-1"))?.state,
      "SUCCEEDED"
    );
  } finally {
    f.db.close();
  }
});
test("atomic quota, concurrent duplicate, provider failure and tenant/review boundaries", async () => {
  const f = setup(2);
  try {
    const concurrent = await Promise.all([
      f.service.generate("tenant-a", copyRequest),
      f.service.generate("tenant-a", copyRequest)
    ]);
    assert.equal(f.calls(), 1);
    assert.ok(concurrent.some((x) => x.state === "SUCCEEDED"));
    f.setFail();
    const request = {
      ...copyRequest,
      assetId: "failed",
      operationId: "failed"
    };
    assert.equal(
      (await f.service.generate("tenant-a", request)).state,
      "FAILED"
    );
    assert.equal(
      (await f.service.generate("tenant-a", request)).state,
      "FAILED"
    );
    assert.equal(f.calls(), 2);
    assert.equal(
      await f.service.read("tenant-a", "campaign", "failed"),
      undefined
    );
    await assert.rejects(
      () =>
        f.service.generate("tenant-a", {
          ...copyRequest,
          assetId: "quota",
          operationId: "quota"
        }),
      /QUOTA_EXHAUSTED/
    );
    assert.equal(f.calls(), 2);
    await assert.rejects(
      () => f.service.list("tenant-b", "campaign"),
      /NOT_FOUND/
    );
    await assert.rejects(
      () => f.service.read("tenant-a", "other", "copy"),
      /NOT_FOUND/
    );
    f.review();
    await assert.rejects(
      () =>
        f.service.generate("tenant-a", {
          ...copyRequest,
          operationId: "reviewed",
          expectedRevision: 1
        }),
      /IMMUTABLE/
    );
    assert.ok(await f.service.read("tenant-a", "campaign", "copy"));
  } finally {
    f.db.close();
  }
});
test("ambiguous STARTED never calls provider again, GENERATED can recover without another model call", async () => {
  const f = setup();
  try {
    const { copyHash } = await import("./emp003-copy-service");
    const fingerprint = await copyHash(JSON.stringify(copyRequest));
    const key = "emp003:copy:tenant-a:op:op-1";
    await f.storage.put(
      key,
      JSON.stringify({
        fingerprint,
        state: "STARTED",
        createdAt: "2026-10-28T20:00:00Z",
        campaignId: "campaign"
      })
    );
    assert.equal(
      (await f.service.generate("tenant-a", copyRequest)).state,
      "STARTED"
    );
    assert.equal(f.calls(), 0);
    await f.storage.put(
      key,
      JSON.stringify({
        fingerprint,
        state: "GENERATED",
        contextHash: await copyHash(JSON.stringify(copyContext)),
        createdAt: "2026-10-28T20:00:00Z",
        campaignId: "campaign",
        draft: {
          tenantId: "tenant-a",
          offeringId: "offering",
          audienceId: "audience",
          channel: "Email",
          headline: "h",
          body: "b",
          claimIds: ["claim"],
          sourceKnowledgeIds: ["knowledge"],
          status: "DRAFT"
        }
      })
    );
    assert.equal(
      (await f.service.generate("tenant-a", copyRequest)).state,
      "SUCCEEDED"
    );
    assert.equal(f.calls(), 0);
    const record = (await f.service.read("tenant-a", "campaign", "copy"))!
      .record;
    f.objects.set(record.objectKey, new TextEncoder().encode("corrupted"));
    await assert.rejects(
      () => f.service.read("tenant-a", "campaign", "copy"),
      /READBACK_FAILED/
    );
  } finally {
    f.db.close();
  }
});
test("authoritative context rejects missing config, cross-tenant knowledge, stale campaign and invented lineage", () => {
  const generator = {
    async generate() {
      throw Error("must not call");
    }
  };
  const stored = { campaign: copyBlueprint, revision: 1 };
  const resolve = (context: unknown, request = copyRequest) =>
    resolveCopyGeneration(
      context === undefined ? undefined : JSON.stringify(context),
      "tenant-a",
      request,
      stored,
      generator
    );
  assert.throws(() => resolve(undefined), /NOT_CONFIGURED/);
  assert.throws(
    () =>
      resolve([
        {
          ...copyContext,
          knowledge: [{ ...copyContext.knowledge[0], tenantId: "tenant-b" }]
        }
      ]),
    /ISOLATION/
  );
  assert.throws(
    () => resolve([copyContext], { ...copyRequest, campaignRevision: 2 }),
    /REVISION_CONFLICT/
  );
  assert.throws(
    () =>
      resolve([
        {
          ...copyContext,
          claims: [{ ...copyContext.claims[0], verified: false }]
        }
      ]),
    /VERIFIED_KNOWLEDGE/
  );
  assert.throws(
    () =>
      resolve([
        {
          ...copyContext,
          campaigns: [{ ...copyContext.campaigns[0], audienceId: "invented" }]
        }
      ]),
    /MISMATCH/
  );
});

test("quota race across distinct assets reserves exactly one provider invocation", async () => {
  const f = setup(1);
  try {
    const results = await Promise.allSettled([
      f.service.generate("tenant-a", copyRequest),
      f.service.generate("tenant-a", {
        ...copyRequest,
        assetId: "another",
        operationId: "another"
      })
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    const rejected = results.find(
      (x) => x.status === "rejected"
    ) as PromiseRejectedResult;
    assert.match(String(rejected.reason), /COPY_QUOTA_EXHAUSTED/);
    assert.equal(f.calls(), 1);
    assert.equal(
      await f.storage.get("emp003:copy:tenant-a:quota:2026-10-28"),
      "1"
    );
  } finally {
    f.db.close();
  }
});

test("GENERATED recovery rejects changed authoritative claims without invoking the provider", async () => {
  const f = setup();
  try {
    const { copyHash } = await import("./emp003-copy-service");
    await f.storage.put(
      "emp003:copy:tenant-a:op:op-1",
      JSON.stringify({
        fingerprint: await copyHash(JSON.stringify(copyRequest)),
        state: "GENERATED",
        contextHash: "0".repeat(64),
        createdAt: "2026-10-28T20:00:00Z",
        campaignId: "campaign",
        draft: {
          tenantId: "tenant-a",
          offeringId: "offering",
          audienceId: "audience",
          channel: "Email",
          headline: "h",
          body: "b",
          claimIds: ["claim"],
          sourceKnowledgeIds: ["knowledge"],
          status: "DRAFT"
        }
      })
    );
    await assert.rejects(
      () => f.service.generate("tenant-a", copyRequest),
      /COPY_CONTEXT_CHANGED/
    );
    assert.equal(f.calls(), 0);
    assert.equal(
      await f.service.read("tenant-a", "campaign", "copy"),
      undefined
    );
  } finally {
    f.db.close();
  }
});
