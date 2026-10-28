import test from "node:test";
import assert from "node:assert/strict";
import { handleEMP003CopyAssets } from "./emp003-copy-routes";
import { handleEMP003CopyDO } from "./emp003-copy-do";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { reviewKey } from "./emp003-review-transaction";
import {
  copyAuth,
  copyFixture,
  copyBlueprint,
  copyContext,
  copyRequest
} from "./emp003-copy-fixture.test-support";
test("Access BFF→tenant DO→generation→list→independent exact-byte GET; role/origin/scope denied", async () => {
  const authn = await copyAuth();
  const a = copyFixture(),
    b = copyFixture();
  let calls = 0;
  await createPersistentBlueprintRepository(
    createEMP003DurableStorageAdapter(a.storage)
  ).put("tenant-a", "campaign", copyBlueprint);
  await a.storage.put("emp003:draft-revision:tenant-a:campaign", 1);
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
      get(id: unknown) {
        const f = id === "tenant-a" ? a : b;
        return {
          fetch: (request: Request) =>
            handleEMP003CopyDO(
              request,
              f.storage as unknown as DurableObjectStorage,
              {
                AI: {} as Ai,
                EMP003_ASSET_BUCKET: f.bucket,
                EMP003_COPY_CONTEXTS_JSON: JSON.stringify([copyContext])
              },
              {
                async generate() {
                  calls++;
                  return {
                    headline: "Probá HerreB",
                    body: "Consultanos por consultoría.",
                    claimIds: ["claim"]
                  };
                }
              }
            )
        };
      }
    }
  };
  const request = (
    path: string,
    token = authn.a,
    body?: unknown,
    headers: Record<string, string> = {}
  ) =>
    new Request("https://pilot.test/api/emp003/assets" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "cf-access-jwt-assertion": token,
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
  const run = (r: Request) => handleEMP003CopyAssets(r, env, authn.fetcher);
  try {
    assert.equal(
      (await run(request("?campaignId=campaign", "bad"))).status,
      401
    );
    assert.equal(
      (await run(request("/generate", authn.b, copyRequest))).status,
      403
    );
    assert.equal(
      (
        await run(
          request("/generate", authn.a, copyRequest, {
            origin: "https://evil.test"
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await run(
          request("/generate", authn.a, {
            ...copyRequest,
            tenantId: "tenant-b"
          })
        )
      ).status,
      400
    );
    assert.equal(
      (await run(request("?campaignId=campaign&tenantId=tenant-b"))).status,
      400
    );
    const created = await run(request("/generate", authn.a, copyRequest));
    assert.equal(created.status, 200);
    const saved = (await created.json()) as { record: { sha256: string } };
    assert.equal(calls, 1);
    const ledger = JSON.parse(
      (await a.storage.get<string>("emp003:copy:tenant-a:op:op-1"))!
    );
    assert.equal(ledger.actorId, "a");
    assert.equal(ledger.contextRevision, 1);
    assert.match(ledger.contextHash, /^[a-f0-9]{64}$/);
    const listed = await run(request("?campaignId=campaign"));
    assert.equal(
      ((await listed.json()) as { assets: unknown[] }).assets.length,
      1
    );
    const bytes = await run(
      request("/content?campaignId=campaign&assetId=copy&revision=1")
    );
    assert.equal(bytes.status, 200);
    assert.equal(bytes.headers.get("x-content-sha256"), saved.record.sha256);
    assert.equal(bytes.headers.get("cache-control"), "private, no-store");
    assert.equal(
      await bytes.text(),
      "Probá HerreB\n\nConsultanos por consultoría."
    );
    assert.equal(
      (await run(request("/content?campaignId=campaign&assetId=copy", authn.b)))
        .status,
      404
    );
    assert.equal(
      (await run(request("/generate", authn.a, copyRequest))).status,
      200
    );
    assert.equal(calls, 1);
  } finally {
    a.db.close();
    b.db.close();
  }
});
test("DO commit guard rejects revision changed while model runs, without another invocation on replay", async () => {
  const f = copyFixture();
  let calls = 0;
  const repo = createPersistentBlueprintRepository(
    createEMP003DurableStorageAdapter(f.storage)
  );
  await repo.put("tenant-a", "campaign", copyBlueprint);
  await f.storage.put("emp003:draft-revision:tenant-a:campaign", 1);
  const request = () =>
    new Request(
      "https://internal/copy-assets/generate?tenantId=tenant-a&campaignId=campaign",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-emp003-copy-actor": "a"
        },
        body: JSON.stringify(copyRequest)
      }
    );
  const env = {
    AI: {} as Ai,
    EMP003_ASSET_BUCKET: f.bucket,
    EMP003_COPY_CONTEXTS_JSON: JSON.stringify([copyContext])
  };
  const generate = {
    async generate() {
      calls++;
      await f.storage.put("emp003:draft-revision:tenant-a:campaign", 2);
      return { headline: "h", body: "b", claimIds: ["claim"] };
    }
  };
  try {
    const first = await handleEMP003CopyDO(
      request(),
      f.storage as unknown as DurableObjectStorage,
      env,
      generate
    );
    assert.equal(first.status, 409);
    assert.equal(
      ((await first.json()) as { error: string }).error,
      "COPY_CAMPAIGN_REVISION_CONFLICT"
    );
    assert.equal((await f.storage.list({ prefix: "emp003:assets:" })).size, 0);
    const replay = await handleEMP003CopyDO(
      request(),
      f.storage as unknown as DurableObjectStorage,
      env,
      generate
    );
    assert.equal(replay.status, 409);
    assert.equal(calls, 1);
  } finally {
    f.db.close();
  }
});
test("DO commit guard rejects concurrent review/approval before persisting any new asset", async () => {
  const f = copyFixture();
  await createPersistentBlueprintRepository(
    createEMP003DurableStorageAdapter(f.storage)
  ).put("tenant-a", "campaign", copyBlueprint);
  await f.storage.put("emp003:draft-revision:tenant-a:campaign", 1);
  const request = new Request(
    "https://internal/copy-assets/generate?tenantId=tenant-a&campaignId=campaign",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-emp003-copy-actor": "a"
      },
      body: JSON.stringify(copyRequest)
    }
  );
  try {
    const response = await handleEMP003CopyDO(
      request,
      f.storage as unknown as DurableObjectStorage,
      {
        AI: {} as Ai,
        EMP003_ASSET_BUCKET: f.bucket,
        EMP003_COPY_CONTEXTS_JSON: JSON.stringify([copyContext])
      },
      {
        async generate() {
          await f.storage.put(reviewKey("tenant-a", "campaign"), {
            tenantId: "tenant-a",
            campaignId: "campaign",
            state: "APPROVED",
            revision: 2,
            lastCorrelationId: null,
            publishExecuted: false
          });
          return { headline: "h", body: "b", claimIds: ["claim"] };
        }
      }
    );
    assert.equal(response.status, 409);
    assert.equal((await f.storage.list({ prefix: "emp003:assets:" })).size, 0);
  } finally {
    f.db.close();
  }
});
