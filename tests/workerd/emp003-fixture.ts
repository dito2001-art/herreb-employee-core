import { EMP003CampaignState } from "../../src/runtime/emp003-campaign-state";
import staging from "../../src/staging/emp003-entry";
export { EMP003CampaignState };
type FixtureEnv = { EMP003_CAMPAIGN_STATE: DurableObjectNamespace };
export default {
  async fetch(request: Request, env: FixtureEnv): Promise<Response> {
    const incoming = new URL(request.url);
    if (incoming.pathname.startsWith("/staging/")) {
      const stagingUrl = new URL(request.url);
      stagingUrl.pathname = stagingUrl.pathname.slice("/staging".length);
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
