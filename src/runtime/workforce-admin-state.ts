import { DurableObject } from "cloudflare:workers";
import type { WorkforceAdminMutation } from "../core/workforce-admin-mutations";
import { resolveWorkforceAdminActor } from "./workforce-admin-auth";
import {
  bootstrapWorkforceAdminState,
  DurableWorkforceAdminAuditSink,
  DurableWorkforceAdminStore,
} from "./workforce-admin-store";
import { executeWorkforceAdminMutation } from "./workforce-admin-write";

interface AdminStateEnv {
  TENANT_MANIFESTS_JSON?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
}

export class WorkforceAdminState extends DurableObject<AdminStateEnv> {
  async fetch(request: Request): Promise<Response> {
    const bootstrap = bootstrapWorkforceAdminState({
      tenantManifestsJson: this.env.TENANT_MANIFESTS_JSON,
      accessIdentityMapJson: this.env.ACCESS_IDENTITY_MAP_JSON,
    });
    const store = new DurableWorkforceAdminStore(this.ctx.storage, bootstrap);
    const audit = new DurableWorkforceAdminAuditSink(this.ctx.storage);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/state") {
      return Response.json(
        { ok: true, state: await store.read() },
        { headers: { "cache-control": "no-store" } }
      );
    }

    if (request.method === "POST" && url.pathname === "/mutate") {
      const body = (await request.json().catch(() => undefined)) as
        | { mutation?: WorkforceAdminMutation; approveYellow?: boolean }
        | undefined;
      if (!body?.mutation) {
        return Response.json(
          { ok: false, error: "WORKFORCE_ADMIN_MUTATION_INVALID" },
          { status: 400 }
        );
      }
      try {
        const current = await store.read();
        const actor = resolveWorkforceAdminActor({ request, identities: current.identities });
        const result = await executeWorkforceAdminMutation({
          actor,
          mutation: body.mutation,
          approveYellow: body.approveYellow,
          store,
          audit,
        });
        const state = await store.read();
        return Response.json(
          { ...result, state },
          {
            status: result.ok ? 200 : 403,
            headers: { "cache-control": "no-store" },
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "WORKFORCE_ADMIN_MUTATION_FAILED";
        const status = message === "WORKFORCE_ADMIN_AUTH_REQUIRED" || message === "WORKFORCE_ADMIN_IDENTITY_NOT_FOUND" ? 401 : 400;
        return Response.json(
          { ok: false, persisted: false, error: message },
          { status, headers: { "cache-control": "no-store" } }
        );
      }
    }

    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
}
