import { buildWorkforceAdminSnapshot, type WorkforceAdminIdentity } from "../core/workforce-admin";
import { parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

export interface WorkforceAdminEnv {
  TENANT_MANIFESTS_JSON?: string;
  ACCESS_IDENTITY_MAP?: string;
}

function toAdminIdentities(raw?: string): WorkforceAdminIdentity[] {
  return parseAccessIdentityBindings(raw).map((identity) => ({
    email: identity.email,
    tenantId: identity.tenantId,
    actorId: identity.actorId,
    role: identity.role,
  }));
}

export function handleWorkforceAdminApi(request: Request, env: WorkforceAdminEnv): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/workforce") return undefined;

  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "GET" } });
  }

  try {
    const manifests = parseRuntimeTenantRegistryManifests(env.TENANT_MANIFESTS_JSON);
    const identities = toAdminIdentities(env.ACCESS_IDENTITY_MAP);
    const snapshot = buildWorkforceAdminSnapshot(manifests, identities);
    return Response.json({ ok: true, snapshot }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "WORKFORCE_ADMIN_CONFIG_INVALID" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
