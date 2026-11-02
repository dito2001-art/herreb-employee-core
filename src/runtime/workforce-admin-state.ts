import { DurableObject } from "cloudflare:workers";
import type { WorkforceAdminMutation } from "../core/workforce-admin-mutations";
import { resolveWorkforceAdminActor } from "./workforce-admin-auth";
import {
  bootstrapWorkforceAdminState,
  DurableWorkforceAdminAuditSink,
  DurableWorkforceAdminStore,
} from "./workforce-admin-store";
import { executeWorkforceAdminMutation } from "./workforce-admin-write";
import { commitApprovedAdminMutation } from "./workforce-admin-approved-transaction";
import { DurableApprovalRequests } from "./workforce-admin-approval-requests";
import { OwnerScopedAdminPolicy } from "./workforce-admin-write";

interface AdminStateEnv {
  TENANT_MANIFESTS_JSON?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
}

function doReceiveProbe(request: Request): Record<string, string> {
  const role = request.headers.get("x-herreb-internal-role")?.trim();
  return {
    "x-herreb-do-internal-actor-received": String(Boolean(request.headers.get("x-herreb-internal-actor-id")?.trim())),
    "x-herreb-do-internal-tenant-received": String(Boolean(request.headers.get("x-herreb-internal-tenant-id")?.trim())),
    "x-herreb-do-internal-role-received": String(Boolean(role)),
    "x-herreb-do-internal-role-owner": String(role === "owner"),
    "x-herreb-do-internal-role-user": String(role === "user"),
  };
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

    if (request.method === "POST" && (url.pathname === "/approval/request" || url.pathname === "/approval/approve")) {
      const body = await request.json().catch(() => undefined) as {
        mutation?: WorkforceAdminMutation; requestId?: string
      } | undefined;
      try {
        const current = await store.read();
        const actor = resolveWorkforceAdminActor({ request, identities: current.identities });
        if (actor.role !== "platform_admin") {
          return Response.json({ ok: false, error: "WORKFORCE_APPROVAL_FORBIDDEN" }, { status: 403 });
        }
        const approvals = new DurableApprovalRequests(this.ctx.storage);
        if (url.pathname === "/approval/request") {
          if (!body?.mutation || !["tenant.create", "identity.delete"].includes(body.mutation.type))
            return Response.json({ ok: false, error: "WORKFORCE_APPROVAL_MUTATION_INVALID" }, { status: 400 });
          const record = await approvals.request({
            requestId: crypto.randomUUID().replace(/-/g, ""),
            requesterActorId: actor.actorId,
            mutation: body.mutation,
            now: Date.now()
          });
          return Response.json({ ok: true, requestId: record.requestId, expiresAt: record.expiresAt }, { headers: { "cache-control": "no-store" } });
        }
        if (typeof body?.requestId !== "string")
          return Response.json({ ok: false, error: "WORKFORCE_APPROVAL_REQUEST_ID_REQUIRED" }, { status: 400 });
        const approved = await approvals.approve({
          requestId: body.requestId,
          approverActorId: actor.actorId,
          now: Date.now()
        });
        return Response.json({ ok: approved }, { status: approved ? 200 : 403, headers: { "cache-control": "no-store" } });
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? error.message : "WORKFORCE_APPROVAL_FAILED" }, { status: 403, headers: { "cache-control": "no-store" } });
      }
    }

    if (request.method === "POST" && url.pathname === "/mutate") {
      const probe = doReceiveProbe(request);
      const body = (await request.json().catch(() => undefined)) as
        | { mutation?: WorkforceAdminMutation; approveYellow?: boolean; approvalRequestId?: string }
        | undefined;
      if (!body?.mutation) {
        return Response.json(
          { ok: false, error: "WORKFORCE_ADMIN_MUTATION_INVALID" },
          { status: 400, headers: probe }
        );
      }
      try {
        const current = await store.read();
        const actor = resolveWorkforceAdminActor({ request, identities: current.identities });
        // A YELLOW request may only consume an independently issued grant.
        // This endpoint never issues grants or accepts caller-provided approver identities.
        const decision = new OwnerScopedAdminPolicy().evaluate(actor, body.mutation);
        if (decision === "YELLOW" && body.approvalRequestId) {
          const auditId = crypto.randomUUID();
          const persisted = await commitApprovedAdminMutation({
            storage: this.ctx.storage,
            bootstrap,
            mutation: body.mutation,
            requesterActorId: actor.actorId,
            requestId: body.approvalRequestId,
            now: Date.now(),
            auditId,
            requesterTenantId: actor.tenantId
          });
          if (!persisted) {
            await audit.append({
              auditId, actorId: actor.actorId, tenantId: actor.tenantId,
              mutationType: body.mutation.type, decision: "YELLOW",
              persisted: false, timestamp: new Date().toISOString()
            });
          }
          return Response.json(
            { ok: persisted, decision: "YELLOW", persisted, auditId },
            { status: persisted ? 200 : 403,
              headers: { "cache-control": "no-store", ...probe } }
          );
        }
        const result = await executeWorkforceAdminMutation({
          actor,
          mutation: body.mutation,
          store,
          audit,
        });
        // Never return the global tenant/identity registry in a mutation response.
        // Authorized reads use the separately scoped admin GET projection.
        return Response.json(
          { ...result },
          {
            status: result.ok ? 200 : 403,
            headers: { "cache-control": "no-store", ...probe },
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "WORKFORCE_ADMIN_MUTATION_FAILED";
        const status = message === "WORKFORCE_ADMIN_AUTH_REQUIRED" || message === "WORKFORCE_ADMIN_IDENTITY_NOT_FOUND" ? 401 : 400;
        return Response.json(
          { ok: false, persisted: false, error: message },
          { status, headers: { "cache-control": "no-store", ...probe } }
        );
      }
    }

    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
}
