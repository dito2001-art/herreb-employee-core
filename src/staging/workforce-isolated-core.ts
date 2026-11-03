import { handleWorkforceCoreResolveActor } from "../runtime/workforce-core-resolve-actor";
export { WorkforceAdminState } from "../runtime/workforce-admin-state";

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
