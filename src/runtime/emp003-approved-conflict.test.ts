import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  copyAuth,
  copyFixture,
  copyBlueprint
} from "./emp003-copy-fixture.test-support";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import { reviewKey } from "./emp003-review-transaction";
import { handleEMP003BrowserDraftWrite } from "./emp003-browser-draft-write";
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "cloudflare:workers" &&
      context.parentURL?.endsWith("/emp003-campaign-state.ts")
    )
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            "export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env;}}"
          ),
        shortCircuit: true
      };
    return next(specifier, context);
  }
});
const { EMP003CampaignState } = await import("./emp003-campaign-state");
hook.deregister();
test("reviewed draft rejects with semantic 409 through actual DO handler and BFF, leaving all storage unchanged", async () => {
  const f = copyFixture();
  const auth = await copyAuth();
  await createPersistentBlueprintRepository(
    createEMP003DurableStorageAdapter(f.storage)
  ).put("tenant-a", "campaign", copyBlueprint);
  await f.storage.put("emp003:draft-revision:tenant-a:campaign", 2);
  const object = new EMP003CampaignState(
    { storage: f.storage } as unknown as DurableObjectState,
    {} as Env
  );
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "copy.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "copy",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      {
        email: "a@test.invalid",
        actorId: "a",
        tenantId: "tenant-a",
        role: "owner"
      }
    ]),
    EMP003_CAMPAIGN_STATE: {
      idFromName: (x: string) => x,
      get() {
        return { fetch: (r: Request) => object.fetch(r) };
      }
    }
  };
  try {
    for (const state of ["APPROVED", "IN_REVIEW"]) {
      await f.storage.put(reviewKey("tenant-a", "campaign"), {
        tenantId: "tenant-a",
        campaignId: "campaign",
        state,
        revision: 2,
        lastCorrelationId: null,
        publishExecuted: false
      });
      const before = [...(await f.storage.list({ prefix: "" }))];
      const response = await handleEMP003BrowserDraftWrite(
        new Request("https://pilot.test/api/emp003/drafts", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-access-jwt-assertion": auth.a
          },
          body: JSON.stringify({
            campaignId: "campaign",
            expectedRevision: 2,
            blueprint: { ...copyBlueprint, positioning: "must never persist" }
          })
        }),
        env,
        auth.fetcher
      );
      assert.equal(response.status, 409);
      assert.equal(
        ((await response.json()) as { error: string }).error,
        "EMP003_REVIEWED_DRAFT_IMMUTABLE"
      );
      assert.deepEqual([...(await f.storage.list({ prefix: "" }))], before);
    }
  } finally {
    f.db.close();
  }
});
