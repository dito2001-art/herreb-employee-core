import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { handleEMP003CopyDO } from "./runtime/emp003-copy-do";
import { createPersistentBlueprintRepository } from "./core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./runtime/emp003-durable-storage";
import {
  copyAuth,
  copyFixture,
  copyBlueprint,
  copyContext,
  copyRequest
} from "./runtime/emp003-copy-fixture.test-support";
const source = readFileSync(new URL("./worker.ts", import.meta.url), "utf8");
const names = new Map<string, Set<string>>();
for (const match of source.matchAll(
  /(?:import|export)\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
)) {
  const set = names.get(match[2]) ?? new Set<string>();
  for (const part of match[1].split(",")) {
    const name = part.trim();
    if (name && !name.startsWith("type ")) set.add(name);
  }
  names.set(match[2], set);
}
const actual = new Set(["./runtime/emp003-copy-routes"]);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith("/src/worker.ts") &&
      !actual.has(specifier)
    ) {
      const code =
        [...(names.get(specifier) ?? [])]
          .map(
            (name) =>
              `export const ${name}=()=>{throw Error("UNEXPECTED_UNUSED_ROUTE")};`
          )
          .join("\n") +
        '\nexport default {fetch(){throw Error("UNEXPECTED_SERVER_FALLBACK")}};';
      return {
        url: "data:text/javascript," + encodeURIComponent(code),
        shortCircuit: true
      };
    }
    return next(specifier, context);
  }
});
const { default: ingress } =
  await import("./staging/workforce-integrated-entry");
hook.deregister();
// The route matrix must fail closed without making any network request.
globalThis.fetch = (async () => {
  throw new Error("UNEXPECTED_TEST_NETWORK");
}) as typeof fetch;
// Run the existing ingress route matrix against the same actual loaded router.
await import("./staging/workforce-integrated-entry.test");

test("Integrated ingress → real Worker → Access BFF→tenant DO→generation→list→independent exact-byte GET; role/origin/scope denied", async () => {
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
  const previousFetch = globalThis.fetch;
  globalThis.fetch = authn.fetcher;
  const integratedEnv = {
    ...env,
    STAGING_ACCESS_TEAM_DOMAIN: env.WORKFORCE_ACCESS_TEAM_DOMAIN,
    STAGING_ACCESS_AUDIENCE: env.WORKFORCE_ACCESS_AUDIENCE,
    STAGING_IDENTITY_MAP_JSON: env.ACCESS_IDENTITY_MAP_JSON
  } as unknown as Parameters<typeof ingress.fetch>[1];
  const run = (r: Request) =>
    ingress.fetch(r, integratedEnv, {} as ExecutionContext);
  try {
    for (const [path, method] of [
      ["/unknown", "GET"],
      ["/content", "POST"],
      ["/generate", "GET"],
      ["/brand-brain", "POST"],
      ["/approve/extra", "POST"]
    ]) {
      const denied = await run(
        new Request("https://pilot.test/api/emp003/assets" + path, { method })
      );
      assert.equal(denied.status, 404);
    }
    assert.equal((await run(request("/brand-brain"))).status, 200);
    assert.equal(
      (await run(request("/brand-brain?tenantId=tenant-b"))).status,
      400
    );
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
    const profile = (await (await run(request("/brand-brain"))).json()) as {
      revision: number;
      hash: string;
    };
    const edit = {
      campaignId: "campaign",
      assetId: "copy",
      operationId: "edit-1",
      expectedRevision: 1,
      baseSha256: saved.record.sha256,
      campaignRevision: 1,
      contextRevision: profile.revision,
      contextHash: profile.hash,
      text: "Manual version"
    };
    assert.equal((await run(request("/edit", authn.b, edit))).status, 403);
    assert.equal(
      (
        await run(
          request("/edit", authn.a, { ...edit, baseSha256: "0".repeat(64) })
        )
      ).status,
      409
    );
    const edited = await run(request("/edit", authn.a, edit));
    assert.equal(edited.status, 200);
    const revision = (await edited.json()) as {
      record: { sha256: string; revision: number };
    };
    assert.equal(revision.record.revision, 2);
    const read = await run(
      request("/content?campaignId=campaign&assetId=copy&revision=2")
    );
    assert.equal(await read.text(), edit.text);
    assert.equal(read.headers.get("x-content-sha256"), revision.record.sha256);
    const approval = {
      campaignId: "campaign",
      assetId: "copy",
      operationId: "approve-2",
      revision: 2,
      sha256: revision.record.sha256,
      campaignRevision: 1,
      contextRevision: profile.revision,
      contextHash: profile.hash,
      claimsReviewed: true
    };
    assert.equal(
      (
        await run(
          request("/approve", authn.a, { ...approval, sha256: "0".repeat(64) })
        )
      ).status,
      409
    );
    assert.equal(
      (await run(request("/approve", authn.a, approval))).status,
      200
    );
    const receipt = await run(
      request("/approval?campaignId=campaign&assetId=copy&revision=2")
    );
    assert.equal(((await receipt.json()) as { active: boolean }).active, true);
    assert.equal(
      (
        await run(
          request("/edit", authn.a, {
            ...edit,
            operationId: "edit-3",
            expectedRevision: 2,
            baseSha256: revision.record.sha256,
            text: "New draft"
          })
        )
      ).status,
      200
    );
    const next = await run(
      request("/approval?campaignId=campaign&assetId=copy&revision=3")
    );
    assert.equal(((await next.json()) as { active: boolean }).active, false);
    assert.equal(
      await (
        await run(
          request("/content?campaignId=campaign&assetId=copy&revision=1")
        )
      ).text(),
      "Probá HerreB\n\nConsultanos por consultoría."
    );
    assert.equal(calls, 1);
    const noStorage = { ...integratedEnv, EMP003_CAMPAIGN_STATE: undefined };
    assert.equal(
      (
        await ingress.fetch(
          request("/brand-brain"),
          noStorage,
          {} as ExecutionContext
        )
      ).status,
      503
    );
  } finally {
    globalThis.fetch = previousFetch;
    a.db.close();
    b.db.close();
  }
});
