import { handleWorkforceCoreResolveActor } from "../runtime/workforce-core-resolve-actor";
import { WorkforceAdminState as SharedWorkforceAdminState } from "../runtime/workforce-admin-state";
import { bootstrapWorkforceAdminState } from "../runtime/workforce-admin-store";
import { initializeIsolatedWorkforceStateOnce } from "./workforce-isolated-bootstrap";

// This subclass is exported only by the dedicated staging Worker. Shared Core
// and its existing Durable Object remain unchanged.
export class WorkforceAdminState extends SharedWorkforceAdminState {
  constructor(
    ctx: ConstructorParameters<typeof SharedWorkforceAdminState>[0],
    env: ConstructorParameters<typeof SharedWorkforceAdminState>[1]
  ) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await initializeIsolatedWorkforceStateOnce(ctx.storage, bootstrapWorkforceAdminState({
        tenantManifestsJson: env.TENANT_MANIFESTS_JSON,
        accessIdentityMapJson: env.ACCESS_IDENTITY_MAP_JSON
      }));
    });
  }
}

// Dedicated private-only authority for isolated staging. No public ingress.
export default {
  fetch(request: Request, env: Parameters<typeof handleWorkforceCoreResolveActor>[1]): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== "workforce.core.internal" ||
        url.pathname !== "/api/internal/workforce/resolve-actor") {
      return Promise.resolve(Response.json({ ok: false, error: "PRIVATE_ROUTE_ONLY" }, { status: 404 }));
    }
    return handleWorkforceCoreResolveActor(request, env);
  }
};
