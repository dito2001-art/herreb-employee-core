import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { copyAuth } from "../runtime/emp003-copy-fixture.test-support";
// Test only the ingress/auth boundary under Node, not Cloudflare DO runtime behavior.
// Any accidental fallback to the shared Worker throws rather than faking success.
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "../worker" &&
      context.parentURL?.endsWith("/staging/emp003-entry.ts")
    )
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            'export class ChatAgent{};export class EMP002Operations{};export class WorkforceAdminState{};export class EMP003CampaignState{};export default {fetch(){throw Error("UNEXPECTED_SHARED_WORKER_FALLBACK")}};'
          ),
        shortCircuit: true
      };
    return next(specifier, context);
  }
});
const { createEMP003StagingEntry } = await import("./emp003-entry");
hook.deregister();
test("new copy ingress routes fail closed before shared Worker; only dedicated Access can forward", async () => {
  const auth = await copyAuth();
  let forwarded = 0;
  const env = {
    EMP003_STAGING_ACCESS_TEAM_DOMAIN: "copy.cloudflareaccess.com",
    EMP003_STAGING_ACCESS_AUDIENCE: "copy",
    EMP003_STAGING_IDENTITY_MAP_JSON: JSON.stringify([
      {
        email: "a@test.invalid",
        actorId: "a",
        tenantId: "tenant-a",
        role: "owner"
      }
    ]),
    EMP003_CAMPAIGN_STATE: {
      idFromName: (id: string) => id,
      get(id: unknown) {
        assert.equal(id, "tenant-a");
        return {
          async fetch(request: Request) {
            forwarded++;
            assert.equal(
              new URL(request.url).searchParams.get("tenantId"),
              "tenant-a"
            );
            return Response.json({ ok: true, assets: [] });
          }
        };
      }
    }
  };
  const entry = createEMP003StagingEntry(auth.fetcher);
  const context = {} as ExecutionContext;
  for (const path of [
    "/api/emp003/assets?campaignId=campaign",
    "/api/emp003/assets/content?campaignId=campaign&assetId=copy",
    "/api/emp003/assets/context?campaignId=campaign",
    "/api/emp003/assets/status?campaignId=campaign&operationId=op-1"
  ]) {
    assert.equal(
      (
        await entry.fetch(
          new Request("https://pilot.test" + path),
          {} as Env,
          context
        )
      ).status,
      503
    );
    assert.equal(
      (
        await entry.fetch(
          new Request("https://pilot.test" + path),
          env as unknown as Env,
          context
        )
      ).status,
      401
    );
  }
  const response = await entry.fetch(
    new Request("https://pilot.test/api/emp003/assets?campaignId=campaign", {
      headers: { "cf-access-jwt-assertion": auth.a }
    }),
    env as unknown as Env,
    context
  );
  assert.equal(response.status, 200);
  assert.equal(forwarded, 1);
  for (const path of [
    "/api/emp003/assets/publish",
    "/api/emp003/assets/other",
    "/copy-assets",
    "/api/internal/emp003/assets"
  ]) {
    assert.equal(
      (
        await entry.fetch(
          new Request("https://pilot.test" + path),
          env as unknown as Env,
          context
        )
      ).status,
      404
    );
  }
});
