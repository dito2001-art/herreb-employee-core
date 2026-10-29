import { EMP003CampaignState } from "../../src/runtime/emp003-campaign-state";
import staging, { createEMP003StagingEntry } from "../../src/staging/emp003-entry";
import workforce from "../../src/worker";
import integrated from "../../src/staging/workforce-integrated-entry";
export { EMP003CampaignState };
type FixtureEnv = { EMP003_CAMPAIGN_STATE: DurableObjectNamespace };
export default {
  async fetch(request: Request, env: FixtureEnv): Promise<Response> {
    const incoming = new URL(request.url);
    if (incoming.pathname === "/fixture/m2m-drafts") {
      const forwarded = new URL(request.url);
      forwarded.pathname = "/api/internal/emp003/drafts";
      return workforce.fetch(new Request(forwarded, request), {
        ...env,
        WORKFORCE_ADMIN_M2M_TOKEN: "wf00-local-only-token",
        WORKFORCE_ADMIN_M2M_ACTOR_ID: "fernando",
        WORKFORCE_ADMIN_M2M_TENANT_ID: "tenant-a"
      } as never, {} as ExecutionContext);
    }
    if (incoming.pathname.startsWith("/integrated/")) {
      const destination = new URL(request.url);
      destination.pathname = destination.pathname.slice("/integrated".length);
      return integrated.fetch(new Request(destination, request), env as never, {} as ExecutionContext);
    }
    if (incoming.pathname.startsWith("/staging/")) {
      const stagingUrl = new URL(request.url);
      stagingUrl.pathname = stagingUrl.pathname.slice("/staging".length);
      if (incoming.pathname.startsWith("/staging/fixture-auth/")) {
        stagingUrl.pathname = stagingUrl.pathname.replace("/fixture-auth", "");
        const jwks = request.headers.get("x-fixture-jwks") ?? "";
        const identities = request.headers.get("x-fixture-identities") ?? "";
        const fixtureEnv = {
          ...env,
          EMP003_STAGING_ACCESS_TEAM_DOMAIN: "wf00-test.cloudflareaccess.com",
          EMP003_STAGING_ACCESS_AUDIENCE: "wf00-test-audience",
          EMP003_STAGING_IDENTITY_MAP_JSON: identities
        };
        const fetcher: typeof fetch = async (input) => {
          if (String(input) !== "https://wf00-test.cloudflareaccess.com/cdn-cgi/access/certs")
            throw new Error("FIXTURE_JWKS_UNEXPECTED_ENDPOINT");
          return new Response(jwks, { headers: { "content-type": "application/json" } });
        };
        return createEMP003StagingEntry(fetcher).fetch(new Request(stagingUrl, request), fixtureEnv as never, {} as ExecutionContext);
      }
      return staging.fetch(new Request(stagingUrl, request), env as never, {} as ExecutionContext);
    }
    if (incoming.pathname !== "/fixture/draft" && incoming.pathname !== "/fixture/review" && incoming.pathname !== "/fixture/transition")
      return new Response("not found", { status: 404 });
    const tenantId = incoming.searchParams.get("tenantId") ?? "";
    const campaignId = incoming.searchParams.get("campaignId") ?? "";
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(campaignId))
      return new Response("invalid fixture scope", { status: 400 });
    const stub = env.EMP003_CAMPAIGN_STATE.get(env.EMP003_CAMPAIGN_STATE.idFromName(tenantId));
    const path = incoming.pathname.replace("/fixture", "");
    const destination = new URL("https://emp003-campaign-state.internal" + path);
    destination.search = incoming.search;
    return stub.fetch(new Request(destination, request));
  }
};
